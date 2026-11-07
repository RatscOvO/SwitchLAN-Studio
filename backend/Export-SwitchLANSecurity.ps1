#requires -version 5.1
<# Read-only, local security checks. Does not change users, firewall or shares. #>
[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputPath)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$items=New-Object System.Collections.Generic.List[object]
$unknown=New-Object System.Collections.Generic.List[string]
$checks=0
function Add-Finding([string]$Id,[string]$Severity,[string]$Title,[string]$Detail,[string]$Advice) {
    $items.Add([ordered]@{id=$Id;severity=$Severity;title=$Title;detail=$Detail;advice=$Advice})
}
try {
    $profiles=@(Get-NetFirewallProfile -ErrorAction Stop)
    $checks++
    foreach ($p in $profiles) {
        if (-not [bool]$p.Enabled) {
            Add-Finding ('firewall-'+$p.Name) 'high' ('防火墙配置已关闭：'+$p.Name) '该 Windows 防火墙配置处于关闭状态。' '检查当前网络配置和防火墙策略，不建议直接关闭整个系统防火墙。'
        }
    }
    if ($profiles.Count -eq 0) { $unknown.Add('防火墙配置未返回数据。') }
} catch { $unknown.Add('无法读取 Windows 防火墙配置。') }
try {
    $guest=@(Get-LocalUser -ErrorAction Stop | Where-Object { [string]$_.SID.Value -match '-501$' })
    $checks++
    if (@($guest | Where-Object { $_.Enabled }).Count -gt 0) {
        Add-Finding 'guest-enabled' 'medium' '内置 Guest 账户处于启用状态' 'Windows 内置来宾账户可能扩大未经明确授权的访问面。' '检查是否确需来宾访问；无需使用时在 Windows 中禁用。'
    }
} catch { $unknown.Add('无法读取内置 Guest 账户状态。') }
try {
    $smb=Get-SmbServerConfiguration -ErrorAction Stop
    $checks++
    if ($smb.EnableSMB1Protocol -eq $true) {
        Add-Finding 'smb1-on' 'high' 'SMB1 协议处于启用状态' 'SMB1 是老旧协议，通常不应在现代局域网中启用。' '确认旧设备需求，并评估关闭 SMB1。'
    }
} catch { $unknown.Add('无法检查 SMB 服务器协议设置。') }
try {
    $shares=@(Get-SmbShare -ErrorAction Stop | Where-Object { -not $_.Special -and -not $_.Name.EndsWith('$') })
    $checks++
    foreach ($share in $shares) {
        try {
            $aces=@(Get-SmbShareAccess -Name $share.Name -ErrorAction Stop)
            foreach ($ace in $aces) {
                if ([string]$ace.AccessControlType -ne 'Allow') { continue }
                $name=[string]$ace.AccountName
                if (($name -in @('Everyone','S-1-1-0','BUILTIN\Guests')) -and
                    ([string]$ace.AccessRight -in @('Change','Full'))) {
                    Add-Finding ('broad-'+$share.Name) 'high' ('共享具有广泛修改授权：'+$share.Name) ($name+' 获得 '+[string]$ace.AccessRight+' 共享权限；实际可访问范围仍受 NTFS 和组策略限制。') '审查该共享的 SMB 与 NTFS 权限，确认是否需要允许广泛写入。'
                }
            }
        } catch { $unknown.Add(('无法读取共享授权：'+[string]$share.Name)) }
    }
} catch { $unknown.Add('无法枚举本机 SMB 共享。') }
try {
    $sessions=@(Get-SmbSession -ErrorAction Stop)
    $checks++
    if ($sessions.Count -gt 0) {
        Add-Finding 'active-sessions' 'info' '当前存在 SMB 客户端会话' ('本机当前有 '+$sessions.Count+' 个 SMB 会话。取消共享前请确认文件没有在传输。') '必要时检查“连接与日志”页面，再决定是否停止共享。'
    }
} catch { $unknown.Add('无法读取当前 SMB 会话；可能需要提升权限。') }
# Only concrete explicit TCP/445 rules. Other firewall conditions and
# inherited policies can affect access, so never claim this is exhaustive.
try {
    $ports=@(Get-NetFirewallPortFilter -ErrorAction Stop | Where-Object {
        [string]$_.Protocol -in @('TCP','6') -and [string]$_.LocalPort -eq '445'
    })
    $checks++
    $count=0
    foreach ($port in $ports) {
        if ($count -ge 100) { $unknown.Add('SMB 防火墙规则数量超过检查上限（100 条）。');break }
        $count++
        $rules=@(Get-NetFirewallRule -AssociatedNetFirewallPortFilter $port -ErrorAction Stop)
        foreach ($rule in $rules) {
            if ([string]$rule.Enabled -ne 'True' -or [string]$rule.Direction -ne 'Inbound' -or [string]$rule.Action -ne 'Allow') { continue }
            $addresses=@(Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $rule -ErrorAction Stop)
            foreach ($address in $addresses) {
                if ([string]$address.RemoteAddress -in @('Any','0.0.0.0/0','::/0')) {
                    Add-Finding ('fw-445-'+$rule.Name) 'medium' '存在不限来源的 SMB 入站允许规则' ('规则 '+[string]$rule.DisplayName+' 匹配 TCP 445，来源设置为 Any；实际是否生效还取决于配置文件及其他防火墙条件。') '核对规则作用网络配置、来源地址、程序和接口限制，避免向不可信网络暴露 SMB。'
                }
            }
        }
    }
} catch { $unknown.Add('无法完整核对 TCP 445 的防火墙入站规则。') }
$payload=[ordered]@{
    schemaVersion=1
    kind='switchlan-security-scan'
    capturedAt=(Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')
    checks=$checks
    findings=@($items.ToArray())
    unknown=@($unknown.ToArray())
    scope='本机 SMB、账户与防火墙配置的只读启发式检查；不计算完整 NTFS 有效权限，不代表系统无风险。'
}
$full=[IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath))
$dir=Split-Path -Parent $full
if (-not (Test-Path -LiteralPath $dir -PathType Container)) { throw '扫描输出目录不存在。' }
[IO.File]::WriteAllText($full,(ConvertTo-Json -InputObject $payload -Depth 8),[Text.UTF8Encoding]::new($true))
