#requires -version 5.1
<#
SwitchLAN Studio - Phase 1, strictly READ-ONLY Windows snapshot exporter.
No commands in this script mutate users, shares, ACLs, IPs or firewall rules.
The produced JSON contains local machine/user/share names; keep it private.
Usage (from the project's directory):
  powershell.exe -NoProfile -File .\backend\Export-SwitchLANSnapshot.ps1 -OutputPath .\snapshot.json
Running as administrator can improve SMB session visibility but is not required.
#>
[CmdletBinding()]
param([string]$OutputPath = (Join-Path (Get-Location).Path 'SwitchLAN-snapshot.json'))
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$warnings = New-Object System.Collections.Generic.List[string]
function Read-Optional {
    param([string]$Label, [scriptblock]$Block)
    try { return @(& $Block) }
    catch {
        $warnings.Add(($Label + ' Unable to read; possibly insufficient permissions, non-existent function or module not loaded.'))
        return @()
    }
}
$adapters = Read-Optional 'Active network adapter' {
    Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
        $a = $_
        $ips = @(Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notlike '169.254.*' } |
            ForEach-Object { @{ ip=[string]$_.IPAddress; prefix=[int]$_.PrefixLength } })
        $profile = Get-NetConnectionProfile -InterfaceIndex $a.ifIndex -ErrorAction SilentlyContinue | Select-Object -First 1
        @{
            name=[string]$a.Name
            isVirtual=[bool](-not $a.HardwareInterface)
            interfaceIndex=[int]$a.ifIndex
            status=[string]$a.Status
            speed=[string]$a.LinkSpeed
            mac=[string]$a.MacAddress
            ipv4=$ips
            profile=$(if($profile){[string]$profile.NetworkCategory}else{'Unknown'})
        }
    }
}
$shares = Read-Optional 'SMB sharing' {
    Get-SmbShare | ForEach-Object {
        $share = $_
        $accessReadable = $true
        $aces = @()
        try {
            $aces = @(Get-SmbShareAccess -Name $share.Name -ErrorAction Stop | ForEach-Object {
                @{
                    account=[string]$_.AccountName
                    accessRight=[string]$_.AccessRight
                    accessControlType=[string]$_.AccessControlType
                }
            })
        } catch {
            $accessReadable = $false
            $warnings.Add(('The shared license cannot be read:' + [string]$share.Name))
        }
        $ntfsReadable=$false
        $ntfs=$null
        if (-not $share.Special -and -not [string]::IsNullOrWhiteSpace([string]$share.Path) -and
            (Test-Path -LiteralPath ([string]$share.Path) -PathType Container)) {
            try {
                $acl=Get-Acl -LiteralPath ([string]$share.Path) -ErrorAction Stop
                $rules=@($acl.Access)
                $ntfs=@{
                    owner=[string]$acl.Owner
                    inheritanceProtected=[bool]$acl.AreAccessRulesProtected
                    truncated=($rules.Count -gt 40)
                    access=@($rules | Select-Object -First 40 | ForEach-Object {
                        @{
                            identity=[string]$_.IdentityReference
                            rights=[string]$_.FileSystemRights
                            type=[string]$_.AccessControlType
                            inherited=[bool]$_.IsInherited
                        }
                    })
                }
                $ntfsReadable=$true
            } catch {
                $warnings.Add(('NTFS permissions cannot be read:'+[string]$share.Name))
            }
        }
        @{
            ntfsReadable=$ntfsReadable
            ntfs=$ntfs
            permissionsReadable=$accessReadable
            name=[string]$share.Name
            description=[string]$share.Description
            path=[string]$share.Path
            special=[bool]$share.Special
            permissions=$aces
        }
    }
}
$groupMap=@{}
try {
    Get-LocalGroup -ErrorAction Stop | ForEach-Object {
        $g=$_
        try {
            Get-LocalGroupMember -Group $g -ErrorAction Stop | ForEach-Object {
                if ($_.SID) {
                    $sid=[string]$_.SID.Value
                    if (-not $groupMap.ContainsKey($sid)) { $groupMap[$sid]=New-Object System.Collections.ArrayList }
                    [void]$groupMap[$sid].Add([string]$g.Name)
                }
            }
        } catch { $warnings.Add(('Group members cannot read:'+[string]$g.Name)) }
    }
} catch { $warnings.Add('Failed to read the local group and the group information it belongs to is incomplete.') }
$adminSids=@{}
$adminMembershipKnown=$true
try {
    $adminGroup=Get-LocalGroup -SID 'S-1-5-32-544' -ErrorAction Stop
    Get-LocalGroupMember -Group $adminGroup -ErrorAction Stop | ForEach-Object {
        if ($_.SID) {
            $memberSid=[string]$_.SID.Value
            $adminSids[$memberSid]=$true
        }
    }
} catch {
    $adminMembershipKnown=$false
    $warnings.Add('The membership of the administrator group cannot be confirmed, and all modifications on the interface still need to be re-verified by the backend.')
}
$users = Read-Optional 'Local users' {
    Get-LocalUser | ForEach-Object {
        $userSid=if ($_.SID) { [string]$_.SID.Value } else { '' }
        # PowerShell 5.1 can unwrap a conditional expression into $null (zero
        # items) or one string (one item). Always store a real JSON array.
        $groupNames = @()
        if ($groupMap.ContainsKey($userSid)) {
            $groupNames = @($groupMap[$userSid].ToArray())
        }
        @{
            name=[string]$_.Name
            fullName=[string]$_.FullName
            description=[string]$_.Description
            lastLogon=$(if ($null -ne $_.LastLogon) { ([DateTime]$_.LastLogon).ToString('yyyy-MM-dd HH:mm:ss') } else { '' })
            sid=$(if($_.SID){[string]$_.SID.Value}else{''})
            enabled=[bool]$_.Enabled
            groups=$groupNames
            isAdministrator=$(if($adminMembershipKnown){[bool]$adminSids.ContainsKey($userSid)}else{$null})
        }
    }
}
$firewallProfiles = Read-Optional 'Firewall configuration' {
    Get-NetFirewallProfile | ForEach-Object {
        @{
            name=[string]$_.Name
            enabled=[bool]$_.Enabled
            defaultInboundAction=[string]$_.DefaultInboundAction
        }
    }
}
$sessions = Read-Optional 'SMB session' {
    Get-SmbSession | ForEach-Object {
        @{
            client=[string]$_.ClientComputerName
            username=[string]$_.ClientUserName
            sessionId=[string]$_.SessionId
        }
    }
}
$payload = @{
    schemaVersion = 1
    kind = 'switchlan-readonly-snapshot'
    capturedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')
    computerName = [string]$env:COMPUTERNAME
    activeUserSid = [string]([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
    interfaces = @($adapters)
    users = @($users)
    shares = @($shares)
    sessions = @($sessions)
    firewallProfiles = @($firewallProfiles)
    summary = @{
        userCount = @($users).Count
        shareCount = @($shares).Count
        sessionCount = @($sessions).Count
        firewallEnabled = $(if(@($firewallProfiles).Count -eq 0){ $null }else{(@($firewallProfiles|Where-Object { -not $_.enabled }).Count -eq 0)})
    }
    warnings = @($warnings.ToArray())
}
$json = ConvertTo-Json -InputObject $payload -Depth 10
$fullPath = [System.IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath))
$directory = Split-Path -Parent $fullPath
if(-not (Test-Path -LiteralPath $directory)){throw ('Destination folder does not exist:' + $directory)}
[System.IO.File]::WriteAllText($fullPath, $json, (New-Object System.Text.UTF8Encoding($true)))
Write-Host 'SwitchLAN read-only snapshot exported:' $fullPath -ForegroundColor Green
Write-Host 'Privacy Tip: The snapshot includes computer name, account name/SID, MAC, share name and file path, please share with caution.'
if($warnings.Count -gt 0){ Write-Warning ('Some items were not obtained:' + ($warnings -join '；')) }
