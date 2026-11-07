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
            Add-Finding ('firewall-'+$p.Name) 'high' ('Firewall configuration is down:'+$p.Name) 'The Windows Firewall configuration is turned off.' 'Check the current network configuration and firewall policy. It is not recommended to directly turn off the entire system firewall.'
        }
    }
    if ($profiles.Count -eq 0) { $unknown.Add('Firewall configuration did not return data.') }
} catch { $unknown.Add('Unable to read Windows Firewall configuration.') }
try {
    $guest=@(Get-LocalUser -ErrorAction Stop | Where-Object { [string]$_.SID.Value -match '-501$' })
    $checks++
    if (@($guest | Where-Object { $_.Enabled }).Count -gt 0) {
        Add-Finding 'guest-enabled' 'medium' 'The built-in Guest account is enabled' 'Windows built-in guest accounts may expand access without explicit authorization.' 'Check if guest access is really needed; disable it in Windows if not needed.'
    }
} catch { $unknown.Add('Unable to read built-in Guest account status.') }
try {
    $smb=Get-SmbServerConfiguration -ErrorAction Stop
    $checks++
    if ($smb.EnableSMB1Protocol -eq $true) {
        Add-Finding 'smb1-on' 'high' 'SMB1 protocol is enabled' 'SMB1 is an old protocol and should generally not be enabled in modern LANs.' 'Identify legacy equipment needs and evaluate closing SMB1.'
    }
} catch { $unknown.Add('Unable to check SMB server protocol settings.') }
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
                    Add-Finding ('broad-'+$share.Name) 'high' ('Shares have broad modification authorization:'+$share.Name) ($name+' Get '+[string]$ace.AccessRight+' Share permissions; actual access scope is still limited by NTFS and Group Policy.') 'Review the SMB and NTFS permissions on the share to see if you need to allow wide write.'
                }
            }
        } catch { $unknown.Add(('Unable to read share authorization:'+[string]$share.Name)) }
    }
} catch { $unknown.Add('Unable to enumerate native SMB shares.') }
try {
    $sessions=@(Get-SmbSession -ErrorAction Stop)
    $checks++
    if ($sessions.Count -gt 0) {
        Add-Finding 'active-sessions' 'info' 'An SMB client session currently exists' ('This machine currently has '+$sessions.Count+' SMB sessions. Please confirm that the file is not being transferred before canceling sharing.') 'If necessary, check the "Connections and Logs" page before deciding whether to stop sharing.'
    }
} catch { $unknown.Add('Unable to read current SMB session; elevated privileges may be required.') }
# Only concrete explicit TCP/445 rules. Other firewall conditions and
# inherited policies can affect access, so never claim this is exhaustive.
try {
    $ports=@(Get-NetFirewallPortFilter -ErrorAction Stop | Where-Object {
        [string]$_.Protocol -in @('TCP','6') -and [string]$_.LocalPort -eq '445'
    })
    $checks++
    $count=0
    foreach ($port in $ports) {
        if ($count -ge 100) { $unknown.Add('The number of SMB firewall rules exceeds the inspection limit (100).');break }
        $count++
        $rules=@(Get-NetFirewallRule -AssociatedNetFirewallPortFilter $port -ErrorAction Stop)
        foreach ($rule in $rules) {
            if ([string]$rule.Enabled -ne 'True' -or [string]$rule.Direction -ne 'Inbound' -or [string]$rule.Action -ne 'Allow') { continue }
            $addresses=@(Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $rule -ErrorAction Stop)
            foreach ($address in $addresses) {
                if ([string]$address.RemoteAddress -in @('Any','0.0.0.0/0','::/0')) {
                    Add-Finding ('fw-445-'+$rule.Name) 'medium' 'Existence of unlimited source SMB inbound allow rules' ('Rules '+[string]$rule.DisplayName+' Matches TCP 445, source is set to Any; actual effect depends on configuration file and other firewall conditions.') 'Check rules against network configuration, source address, program and interface restrictions to avoid exposing SMB to untrusted networks.'
                }
            }
        }
    }
} catch { $unknown.Add('Unable to fully check firewall inbound rules for TCP 445.') }
$payload=[ordered]@{
    schemaVersion=1
    kind='switchlan-security-scan'
    capturedAt=(Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')
    checks=$checks
    findings=@($items.ToArray())
    unknown=@($unknown.ToArray())
    scope='Read-only heuristic checking of native SMB, account and firewall configurations; does not count full NTFS effective permissions and does not mean the system is risk-free.'
}
$full=[IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath))
$dir=Split-Path -Parent $full
if (-not (Test-Path -LiteralPath $dir -PathType Container)) { throw 'The scan output directory does not exist.' }
[IO.File]::WriteAllText($full,(ConvertTo-Json -InputObject $payload -Depth 8),[Text.UTF8Encoding]::new($true))
