#requires -version 5.1
<#
SwitchLAN Studio 1.3 - Windows 11 diagnostics (read-only inspection).
Does not change users, ACL, shares, adapters, IP, or firewall settings.
Only creates two diagnostic files inside -OutputDirectory.
Run: powershell.exe -NoProfile -File .\backend\Test-SwitchLANEnvironment.ps1
Reports contain usernames, IP addresses and shared folder paths. Review before sharing.
#>
[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path (Get-Location).Path 'diagnostics')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$checks = New-Object 'System.Collections.Generic.List[object]'
$notes = New-Object 'System.Collections.Generic.List[string]'
function Add-Check {
    param([string]$Id, [string]$Status, [string]$Title, [string]$Detail)
    [void]$checks.Add([ordered]@{ id=$Id; status=$Status; title=$Title; detail=$Detail })
}
function Has-Command([string]$CommandName) {
    return ($null -ne (Get-Command -Name $CommandName -ErrorAction SilentlyContinue))
}
function Capture-Error([string]$Section, [string]$Message) {
    Add-Check ('query-' + $Section) 'unknown' ($Section + ' 无法读取') $Message
}
function Ipv4-Range([string]$Address, [int]$Prefix) {
    if ($Prefix -lt 0 -or $Prefix -gt 32) { throw '无效前缀长度' }
    $bytes = [System.Net.IPAddress]::Parse($Address).GetAddressBytes()
    if ($bytes.Length -ne 4) { throw '只接受 IPv4' }
    [uint64]$n = 0
    foreach ($b in $bytes) { $n = $n * 256 + [uint64]$b }
    $size = [math]::Pow(2, (32 - $Prefix))
    [uint64]$start = [uint64]([math]::Floor(([double]$n) / $size) * $size)
    [uint64]$end = $start + [uint64]$size - 1
    return @{ start=$start; end=$end }
}

$report = [ordered]@{
    schemaVersion = 1
    kind = 'switchlan-windows-readiness'
    version = '1.3'
    generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')
    environment = [ordered]@{
        computerName = [string]$env:COMPUTERNAME
        os = [Environment]::OSVersion.VersionString
        psVersion = [string]$PSVersionTable.PSVersion
        isAdministrator = $false
    }
    commands = @()
    adapters = @()
    ipv4 = @()
    firewallProfiles = @()
    shares = @()
    checks = @()
    privacyNote = '报告含计算机名、IP、共享路径和账户/组名称；发布或上传前请脱敏。'
}

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    $report.environment.isAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch {
    Capture-Error '管理员状态' $_.Exception.Message
}

$needed = @(
    'Get-NetAdapter','Get-NetIPAddress','Get-NetRoute','Get-NetConnectionProfile',
    'Get-NetFirewallProfile','Get-NetFirewallRule','Get-NetFirewallPortFilter',
    'Get-SmbShare','Get-SmbShareAccess','Get-SmbSession','Get-LocalUser','Get-NetTCPConnection'
)
$commandResults = @()
foreach ($name in $needed) {
    $exists = Has-Command $name
    $commandResults += [ordered]@{ name=$name; available=[bool]$exists }
    if (-not $exists) { Add-Check ('missing-' + $name) 'warn' ('缺少命令：' + $name) '系统版本、模块或 PowerShell 环境可能不支持，请 DSH 核查。' }
}
$report.commands = @($commandResults)
if ($PSVersionTable.PSVersion.Major -lt 5) { Add-Check 'ps-version' 'warn' 'PowerShell 版本偏旧' '建议使用系统自带 Windows PowerShell 5.1。' }
if (-not $report.environment.isAdministrator) { Add-Check 'not-admin' 'info' '当前为非管理员权限' '只读检查通常可以运行，但 SMB 会话或部分规则可能无法读取。无需为了本次诊断自动提权。' }

$adapterData = @()
$ipv4Data = @()
$activeIndices = @()
if (Has-Command 'Get-NetAdapter') {
    try {
        $netAdapters = @(Get-NetAdapter -ErrorAction Stop)
        $adapterData = @($netAdapters | ForEach-Object {
            [ordered]@{
                name=[string]$_.Name
                index=[int]$_.ifIndex
                status=[string]$_.Status
                description=[string]$_.InterfaceDescription
                linkSpeed=[string]$_.LinkSpeed
            }
        })
        $activeIndices = @($netAdapters | Where-Object { [string]$_.Status -eq 'Up' } | ForEach-Object { [int]$_.ifIndex })
        Add-Check 'adapters-present' $(if ($activeIndices.Count) {'pass'} else {'warn'}) '网卡检查' ("共检测到 $($netAdapters.Count) 块网卡，其中 $($activeIndices.Count) 块处于 Up 状态。")
    } catch { Capture-Error '网卡' $_.Exception.Message }
}
$report.adapters = @($adapterData)

if (Has-Command 'Get-NetIPAddress') {
    try {
        $ipv4Data = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -notlike '127.*' -and
                $_.IPAddress -notlike '169.254.*' -and
                ($activeIndices -contains [int]$_.InterfaceIndex)
            } | ForEach-Object {
                [ordered]@{
                    address=[string]$_.IPAddress
                    prefix=[int]$_.PrefixLength
                    interfaceIndex=[int]$_.InterfaceIndex
                    interfaceAlias=[string]$_.InterfaceAlias
                }
            })
        if ($ipv4Data.Count -eq 0) { Add-Check 'no-active-ipv4' 'warn' '没有发现活动网卡的有效 IPv4' '检查网线状态和静态 IP 设置。' }
        $conflicts = New-Object 'System.Collections.Generic.List[string]'
        for ($i=0; $i -lt $ipv4Data.Count; $i++) {
            for ($j=$i+1; $j -lt $ipv4Data.Count; $j++) {
                $a=$ipv4Data[$i]; $b=$ipv4Data[$j]
                if ($a.interfaceIndex -eq $b.interfaceIndex) { continue }
                $ra=Ipv4-Range $a.address $a.prefix
                $rb=Ipv4-Range $b.address $b.prefix
                if ($ra.start -le $rb.end -and $rb.start -le $ra.end) {
                    [void]$conflicts.Add("$($a.interfaceAlias)($($a.address)/$($a.prefix)) ↔ $($b.interfaceAlias)($($b.address)/$($b.prefix))")
                }
            }
        }
        if ($conflicts.Count) {
            Add-Check 'overlapping-ipv4' 'warn' '不同活动网卡的 IPv4 子网重叠' ($conflicts -join '；')
        } else {
            Add-Check 'overlapping-ipv4' 'pass' '未发现活动网卡间的 IPv4 子网重叠' '仅检查当前活动网卡及其 IPv4 地址；不代表不存在其他路由问题。'
        }
    } catch { Capture-Error 'IPv4 与子网重叠' $_.Exception.Message }
}
$report.ipv4 = @($ipv4Data)

if (Has-Command 'Get-NetRoute') {
    try {
        $defaults = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop)
        if ($defaults.Count -gt 1) {
            Add-Check 'multiple-default-routes' 'info' '检测到多个 IPv4 默认路由' '多条默认路由不一定有故障；请结合 InterfaceMetric、RouteMetric 和网关核对优先级。'
        } elseif ($defaults.Count -eq 0) {
            Add-Check 'missing-default-route' 'info' '没有 IPv4 默认路由' '同网段局域网仍可互通，但通常无法通过该网络访问外网。'
        } else {
            Add-Check 'default-route' 'pass' '检测到一条 IPv4 默认路由' '有默认路由不代表可以访问互联网。'
        }
    } catch { Capture-Error '路由表' $_.Exception.Message }
}

if (Has-Command 'Get-NetFirewallProfile') {
    try {
        $profiles = @(Get-NetFirewallProfile -ErrorAction Stop | ForEach-Object {
            [ordered]@{ name=[string]$_.Name; enabled=[bool]$_.Enabled; defaultInbound=[string]$_.DefaultInboundAction }
        })
        $report.firewallProfiles = @($profiles)
        if ($profiles.Count -eq 0) {
            Add-Check 'firewall-profile' 'unknown' '无法确认防火墙状态' '没有返回配置文件。'
        } elseif (@($profiles | Where-Object { -not $_.enabled }).Count -gt 0) {
            Add-Check 'firewall-profile' 'warn' '有 Windows 防火墙配置文件处于关闭状态' '本工具不会自动打开或关闭防火墙；需要人工检查。'
        } else {
            Add-Check 'firewall-profile' 'pass' '所有返回的防火墙配置文件均已启用' '仍需检查已有允许规则，不能据此证明 SMB 只对白名单开放。'
        }
    } catch { Capture-Error '防火墙配置' $_.Exception.Message }
}
Add-Check 'firewall-smb-scope' 'unknown' 'SMB 入站规则暴露范围尚未完整审计' '此诊断不推断所有第三方/本地/组策略防火墙规则的合并效果；需要单独审核 TCP 445 的来源与接口限制。'

if (Has-Command 'Get-SmbShare') {
    try {
        $allShares = @(Get-SmbShare -ErrorAction Stop)
        $shareData = @()
        foreach ($share in $allShares) {
            $aclRows = @()
            if (Has-Command 'Get-SmbShareAccess') {
                try {
                    $aclRows = @(Get-SmbShareAccess -Name $share.Name -ErrorAction Stop | ForEach-Object {
                        [ordered]@{ account=[string]$_.AccountName; right=[string]$_.AccessRight; type=[string]$_.AccessControlType }
                    })
                } catch { Add-Check ('share-acl-' + [string]$share.Name) 'unknown' '共享 ACL 无法读取' $_.Exception.Message }
            }
            $shareData += [ordered]@{name=[string]$share.Name;path=[string]$share.Path;special=[bool]$share.Special;access=@($aclRows)}
            if (-not [bool]$share.Special) {
                $path = [string]$share.Path
                if ($path -match '^[a-zA-Z]:\\(?:Users(?:\\|$)|Windows(?:\\|$))' -or $path -match '^[a-zA-Z]:\\?$') {
                    Add-Check ('high-risk-share-' + [string]$share.Name) 'warn' '存在需要复核的高敏感共享路径' ("共享 $($share.Name) → $path。不要直接广泛共享用户目录、系统目录或盘符根目录。")
                }
                if (@($aclRows | Where-Object { $_.account -match '(^|\\)Everyone$' -and $_.type -eq 'Allow' -and $_.right -in @('Full','Change') }).Count -gt 0) {
                    Add-Check ('everyone-share-' + [string]$share.Name) 'warn' '共享层含 Everyone 的高权限授权' ("共享 $($share.Name) 需要结合 NTFS ACL、账户认证和实际网络可达性复核。")
                }
            }
        }
        $report.shares = @($shareData)
        Add-Check 'share-read' 'pass' '已读取 SMB 共享目录' ("共读取 $($allShares.Count) 个共享，包括内置特殊共享。")
    } catch { Capture-Error 'SMB 共享' $_.Exception.Message }
}
# Multiple passive signals: absence of a Listen row (or no 445 rows at all) is NOT proof that SMB is down.
if (Has-Command 'Get-NetTCPConnection') {
    try {
        $connections445 = @(Get-NetTCPConnection -LocalPort 445 -ErrorAction SilentlyContinue)
        $listening445 = @($connections445 | Where-Object { [string]$_.State -eq 'Listen' })
        $service = Get-Service -Name 'LanmanServer' -ErrorAction Stop
        $shareRead = @($checks | Where-Object { $_.id -eq 'share-read' -and $_.status -eq 'pass' }).Count -gt 0
        $evidence = "LanmanServer=$($service.Status)，共享读取=$shareRead，TCP445连接记录=$($connections445.Count)，Listen=$($listening445.Count)。"
        if ($service.Status -eq 'Running' -and $shareRead) {
            Add-Check 'smb-listener' 'info' 'SMB 服务的本机状态' ($evidence + '服务已运行且共享可读取；TCP 445 查询没有 Listen 记录或没有当前连接时，不能据此认定 SMB 已停止。外部设备能否访问仍需单独验证。')
        } else {
            Add-Check 'smb-listener' 'unknown' 'SMB 服务可用性尚未确认' ($evidence + '需要检查服务、共享读取权限以及客户端连接；不能仅凭这一项宣称服务不可用。')
        }
    } catch { Capture-Error 'TCP 445 与 SMB 服务' $_.Exception.Message }
}
Add-Check 'ntfs-not-scanned' 'unknown' '没有计算 NTFS 实际有效权限' 'NTFS ACL、继承、组、Deny 与多共享入口需要单独审计；报告不能宣称文件夹绝对安全。'

$report.checks = @($checks.ToArray())
$targetDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
if (-not [IO.Directory]::Exists($targetDir)) { [void][IO.Directory]::CreateDirectory($targetDir) }
$jsonPath = Join-Path $targetDir 'SwitchLAN-Diagnostics.json'
$mdPath = Join-Path $targetDir 'SwitchLAN-Diagnostics.md'
$utf8 = New-Object System.Text.UTF8Encoding($true)
[IO.File]::WriteAllText($jsonPath, (ConvertTo-Json -InputObject $report -Depth 10), $utf8)

$md = New-Object 'System.Collections.Generic.List[string]'
[void]$md.Add('# SwitchLAN Studio · Windows 本机环境诊断')
[void]$md.Add('')
[void]$md.Add('> 仅用于协作排查，不是安全证明。报告可能含真实计算机名、IP、用户名及共享路径，外发前请检查脱敏。')
[void]$md.Add('')
[void]$md.Add(('采集时间：' + $report.generatedAt))
[void]$md.Add(('操作系统：' + $report.environment.os))
[void]$md.Add(('PowerShell：' + $report.environment.psVersion))
[void]$md.Add(('管理员模式：' + $report.environment.isAdministrator))
[void]$md.Add('')
[void]$md.Add('## 检查结果')
foreach ($row in $report.checks) {
    [void]$md.Add(('- [' + $row.status.ToUpperInvariant() + '] ' + $row.title + ' — ' + $row.detail.Replace("`n", ' ')))
}
[void]$md.Add('')
[void]$md.Add('## 活动网卡 IPv4（有隐私信息）')
foreach ($ip in $report.ipv4) { [void]$md.Add(('- ' + $ip.interfaceAlias + ': ' + $ip.address + '/' + $ip.prefix)) }
[void]$md.Add('')
[void]$md.Add('## SMB 共享（有隐私信息）')
foreach ($share in $report.shares) {
    [void]$md.Add(('- ' + $share.name + ' : ' + $share.path + $(if ($share.special) { ' [系统特殊共享]' } else { '' })))
}
[void]$md.Add('')
[void]$md.Add('## 审核者注意事项')
[void]$md.Add('- 不修改用户、共享、NTFS ACL、网卡、IP 或防火墙来完成这次检查。')
[void]$md.Add('- PASS 表示该局部读取或条件检查通过，不意味着整机安全。UNKNOWN 代表未检查或无法确定。')
[void]$md.Add('- 请区分软件代码错误、权限不足、Windows 环境差异、虚拟网卡冲突与正常安全阻断。')
# Markdown uses UTF-8 BOM for Windows PowerShell 5.1 Get-Content/legacy editors.
$utf8WithBom = New-Object System.Text.UTF8Encoding($true)
[IO.File]::WriteAllText($mdPath, ($md -join "`r`n"), $utf8WithBom)
Write-Host '诊断完成（没有修改 Windows 用户、权限或防火墙）。' -ForegroundColor Green
Write-Host ('报告：' + $mdPath)
Write-Host ('结构化数据：' + $jsonPath)
Write-Warning '报告含本机信息，发送给他人或上传 GitHub 前务必脱敏。'
