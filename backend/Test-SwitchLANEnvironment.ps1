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
    Add-Check ('query-' + $Section) 'unknown' ($Section + ' Unable to read') $Message
}
function Ipv4-Range([string]$Address, [int]$Prefix) {
    if ($Prefix -lt 0 -or $Prefix -gt 32) { throw 'Invalid prefix length' }
    $bytes = [System.Net.IPAddress]::Parse($Address).GetAddressBytes()
    if ($bytes.Length -ne 4) { throw 'Only accept IPv4' }
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
    privacyNote = 'The report contains computer name, IP, share path and account/group name; please desensitize it before publishing or uploading.'
}

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    $report.environment.isAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch {
    Capture-Error 'Administrator status' $_.Exception.Message
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
    if (-not $exists) { Add-Check ('missing-' + $name) 'warn' ('Missing command:' + $name) 'The system version, module or PowerShell environment may not be supported, please check with DSH.' }
}
$report.commands = @($commandResults)
if ($PSVersionTable.PSVersion.Major -lt 5) { Add-Check 'ps-version' 'warn' 'PowerShell version is too old' 'It is recommended to use Windows PowerShell 5.1 that comes with the system.' }
if (-not $report.environment.isAdministrator) { Add-Check 'not-admin' 'info' 'Currently non-administrator privileges' 'Read-only checks usually run, but SMB sessions or some rules may not be readable. There is no need to automatically escalate privileges for this diagnosis.' }

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
        Add-Check 'adapters-present' $(if ($activeIndices.Count) {'pass'} else {'warn'}) 'Network adapter check' ("A total of $($netAdapters.Count) block network adapters were detected, of which $($activeIndices.Count) block was in the Up state.")
    } catch { Capture-Error 'Network adapter' $_.Exception.Message }
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
        if ($ipv4Data.Count -eq 0) { Add-Check 'no-active-ipv4' 'warn' 'No valid IPv4 found for active network adapter' 'Check network cable status and static IP settings.' }
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
            Add-Check 'overlapping-ipv4' 'warn' 'Overlapping IPv4 subnets for different active network adapters' ($conflicts -join '；')
        } else {
            Add-Check 'overlapping-ipv4' 'pass' 'No IPv4 subnet overlap found between active network adapters' 'Only checks the currently active network adapter and its IPv4 address; this does not mean that there are no other routing issues.'
        }
    } catch { Capture-Error 'IPv4 overlaps with subnets' $_.Exception.Message }
}
$report.ipv4 = @($ipv4Data)

if (Has-Command 'Get-NetRoute') {
    try {
        $defaults = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop)
        if ($defaults.Count -gt 1) {
            Add-Check 'multiple-default-routes' 'info' 'Multiple IPv4 default routes detected' 'Multiple default routes are not necessarily faulty; please check priorities using InterfaceMetric, RouteMetric, and gateways.'
        } elseif ($defaults.Count -eq 0) {
            Add-Check 'missing-default-route' 'info' 'No IPv4 default route' 'LANs on the same subnet can still communicate with each other, but usually cannot access the external network through this network.'
        } else {
            Add-Check 'default-route' 'pass' 'An IPv4 default route detected' 'Having a default route does not mean that you can access the Internet.'
        }
    } catch { Capture-Error 'Routing table' $_.Exception.Message }
}

if (Has-Command 'Get-NetFirewallProfile') {
    try {
        $profiles = @(Get-NetFirewallProfile -ErrorAction Stop | ForEach-Object {
            [ordered]@{ name=[string]$_.Name; enabled=[bool]$_.Enabled; defaultInbound=[string]$_.DefaultInboundAction }
        })
        $report.firewallProfiles = @($profiles)
        if ($profiles.Count -eq 0) {
            Add-Check 'firewall-profile' 'unknown' 'Unable to confirm firewall status' 'No configuration file returned.'
        } elseif (@($profiles | Where-Object { -not $_.enabled }).Count -gt 0) {
            Add-Check 'firewall-profile' 'warn' 'There is a Windows Firewall profile that is turned off' 'This tool does not automatically turn the firewall on or off; manual inspection is required.'
        } else {
            Add-Check 'firewall-profile' 'pass' 'All returned firewall profiles are enabled' 'It still needs to be checked that there are existing allow rules, which cannot prove that SMB is only open to the whitelist.'
        }
    } catch { Capture-Error 'Firewall configuration' $_.Exception.Message }
}
Add-Check 'firewall-smb-scope' 'unknown' 'SMB inbound rule exposure scope has not been fully audited' 'This diagnostic does not infer the combined effect of all third-party/local/group policy firewall rules; source and interface restrictions for TCP 445 need to be reviewed individually.'

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
                } catch { Add-Check ('share-acl-' + [string]$share.Name) 'unknown' 'Shared ACL cannot be read' $_.Exception.Message }
            }
            $shareData += [ordered]@{name=[string]$share.Name;path=[string]$share.Path;special=[bool]$share.Special;access=@($aclRows)}
            if (-not [bool]$share.Special) {
                $path = [string]$share.Path
                if ($path -match '^[a-zA-Z]:\\(?:Users(?:\\|$)|Windows(?:\\|$))' -or $path -match '^[a-zA-Z]:\\?$') {
                    Add-Check ('high-risk-share-' + [string]$share.Name) 'warn' 'There is a highly sensitive shared path that needs to be reviewed' ("Share $($share.Name) → $path. Do not share user directories, system directories, or drive letter roots directly and widely.")
                }
                if (@($aclRows | Where-Object { $_.account -match '(^|\\)Everyone$' -and $_.type -eq 'Allow' -and $_.right -in @('Full','Change') }).Count -gt 0) {
                    Add-Check ('everyone-share-' + [string]$share.Name) 'warn' 'The sharing layer includes high-privilege authorization for Everyone' ("Share $($share.Name) needs to be reviewed with NTFS ACLs, account authentication, and actual network reachability.")
                }
            }
        }
        $report.shares = @($shareData)
        Add-Check 'share-read' 'pass' 'SMB shared directory read' ("A total of $($allShares.Count) shares were read, including built-in special shares.")
    } catch { Capture-Error 'SMB sharing' $_.Exception.Message }
}
# Multiple passive signals: absence of a Listen row (or no 445 rows at all) is NOT proof that SMB is down.
if (Has-Command 'Get-NetTCPConnection') {
    try {
        $connections445 = @(Get-NetTCPConnection -LocalPort 445 -ErrorAction SilentlyContinue)
        $listening445 = @($connections445 | Where-Object { [string]$_.State -eq 'Listen' })
        $service = Get-Service -Name 'LanmanServer' -ErrorAction Stop
        $shareRead = @($checks | Where-Object { $_.id -eq 'share-read' -and $_.status -eq 'pass' }).Count -gt 0
        $evidence = "LanmanServer=$($service.Status), Shared Read=$shareRead, TCP445 Connection Record=$($connections445.Count), Listen=$($listening445.Count)."
        if ($service.Status -eq 'Running' -and $shareRead) {
            Add-Check 'smb-listener' 'info' 'Native status of SMB service' ($evidence + 'The service is running and the share is readable; a TCP 445 query with no Listen record or no current connection does not assume that SMB is stopped. Access by external devices still needs to be verified individually.')
        } else {
            Add-Check 'smb-listener' 'unknown' 'SMB service availability not yet confirmed' ($evidence + 'Service, share read permissions, and client connections need to be checked; this alone cannot be used to declare a service unavailable.')
        }
    } catch { Capture-Error 'TCP 445 and SMB services' $_.Exception.Message }
}
Add-Check 'ntfs-not-scanned' 'unknown' 'Not calculating actual effective NTFS permissions' 'NTFS ACL, inheritance, group, Deny and multi-share entries need to be audited separately; the report cannot declare that the folder is absolutely safe.'

$report.checks = @($checks.ToArray())
$targetDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
if (-not [IO.Directory]::Exists($targetDir)) { [void][IO.Directory]::CreateDirectory($targetDir) }
$jsonPath = Join-Path $targetDir 'SwitchLAN-Diagnostics.json'
$mdPath = Join-Path $targetDir 'SwitchLAN-Diagnostics.md'
$utf8 = New-Object System.Text.UTF8Encoding($true)
[IO.File]::WriteAllText($jsonPath, (ConvertTo-Json -InputObject $report -Depth 10), $utf8)

$md = New-Object 'System.Collections.Generic.List[string]'
[void]$md.Add('# SwitchLAN Studio · Windows native environment diagnosis')
[void]$md.Add('')
[void]$md.Add('> Only for collaborative troubleshooting, not security certification. The report may contain real computer name, IP, user name and share path. Please check for desensitization before sending out.')
[void]$md.Add('')
[void]$md.Add(('Collection time:' + $report.generatedAt))
[void]$md.Add(('Operating system:' + $report.environment.os))
[void]$md.Add(('PowerShell：' + $report.environment.psVersion))
[void]$md.Add(('Administrator mode:' + $report.environment.isAdministrator))
[void]$md.Add('')
[void]$md.Add('## Check results')
foreach ($row in $report.checks) {
    [void]$md.Add(('- [' + $row.status.ToUpperInvariant() + '] ' + $row.title + ' — ' + $row.detail.Replace("`n", ' ')))
}
[void]$md.Add('')
[void]$md.Add('## Active network adapter IPv4 (with private information)')
foreach ($ip in $report.ipv4) { [void]$md.Add(('- ' + $ip.interfaceAlias + ': ' + $ip.address + '/' + $ip.prefix)) }
[void]$md.Add('')
[void]$md.Add('## SMB sharing (with private information)')
foreach ($share in $report.shares) {
    [void]$md.Add(('- ' + $share.name + ' : ' + $share.path + $(if ($share.special) { ' [System special sharing]' } else { '' })))
}
[void]$md.Add('')
[void]$md.Add('## Notes for reviewers')
[void]$md.Add('- Do not modify users, shares, NTFS ACLs, network adapters, IPs, or firewalls to complete this check.')
[void]$md.Add('- PASS means that the partial read or condition check passed, but it does not mean that the entire machine is safe. UNKNOWN means not checked or undetermined.')
[void]$md.Add('- Please distinguish between software code errors, insufficient permissions, differences in Windows environments, virtual network adapter conflicts and normal security blocking.')
# Markdown uses UTF-8 BOM for Windows PowerShell 5.1 Get-Content/legacy editors.
$utf8WithBom = New-Object System.Text.UTF8Encoding($true)
[IO.File]::WriteAllText($mdPath, ($md -join "`r`n"), $utf8WithBom)
Write-Host 'Diagnostics completed (no modifications to Windows users, permissions, or firewalls).' -ForegroundColor Green
Write-Host ('Report:' + $mdPath)
Write-Host ('Structured data:' + $jsonPath)
Write-Warning 'The report contains local information, which must be desensitized before sending it to others or uploading it to GitHub.'
