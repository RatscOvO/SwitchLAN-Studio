#requires -version 5.1
<#
SwitchLAN Studio — elevated one-shot operations (PowerShell 5.1).
A fixed allowlist of operations. No arbitrary script/command execution.
Passwords are returned only to the calling desktop process; never saved in managed.json.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RequestPath,
    [Parameter(Mandatory)][string]$ResultPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$StoreDir = Join-Path $env:ProgramData 'SwitchLAN Studio'
$RegistryPath = Join-Path $StoreDir 'managed.json'
$UserMarker = 'SwitchLAN managed account'
$ShareMarker = 'SwitchLAN managed share'

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Write-Result {
    param([bool]$Ok, [string]$Message, $Data)
    $result = [ordered]@{
        ok = $Ok; message = $Message; data = $Data
        timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')
    }
    $resultDir = Split-Path -Parent $ResultPath
    if (-not (Test-Path -LiteralPath $resultDir -PathType Container)) {
        New-Item -Path $resultDir -ItemType Directory -Force | Out-Null
    }
    $json = ConvertTo-Json -InputObject $result -Depth 10
    [IO.File]::WriteAllText($ResultPath,$json,([Text.UTF8Encoding]::new($true)))
}
function Protect-Store {
    if (-not (Test-Path -LiteralPath $StoreDir -PathType Container)) {
        [void](New-Item -Path $StoreDir -ItemType Directory -Force)
    }
    $storeItem = Get-Item -LiteralPath $StoreDir -Force
    if (($storeItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'The managed data directory is a reparse point and writes are denied.'
    }
    if ((Test-Path -LiteralPath $RegistryPath -PathType Leaf) -and
        (((Get-Item -LiteralPath $RegistryPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
        throw 'The managed data file is a reparse point and is rejected for writing.'
    }
    # Only administrators/SYSTEM can change the registry, while Users can read it.
    $acl = Get-Acl -LiteralPath $StoreDir
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($oldRule in @($acl.Access)) {
        [void]$acl.RemoveAccessRuleSpecific($oldRule)
    }
    $inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    foreach ($grant in @(
        [pscustomobject]@{ Sid='S-1-5-18'; Right='FullControl' },
        [pscustomobject]@{ Sid='S-1-5-32-544'; Right='FullControl' },
        [pscustomobject]@{ Sid='S-1-5-32-545'; Right='ReadAndExecute' }
    )) {
        $sid = [Security.Principal.SecurityIdentifier]::new([string]$grant.Sid)
        $rights = [Enum]::Parse([Security.AccessControl.FileSystemRights],[string]$grant.Right)
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid,$rights,$inheritance,
            [Security.AccessControl.PropagationFlags]::None,
            [Security.AccessControl.AccessControlType]::Allow)
        [void]$acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $StoreDir -AclObject $acl
}
function Read-Registry {
    $registry = [ordered]@{ schemaVersion=1; users=@(); shares=@() }
    if (-not (Test-Path -LiteralPath $RegistryPath -PathType Leaf)) { return $registry }
    $raw = [IO.File]::ReadAllText($RegistryPath,[Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($null -eq $raw -or $raw.schemaVersion -ne 1) { throw 'Unsupported managed manifest version.' }
    if ($null -ne $raw.users) { $registry.users = @($raw.users) }
    if ($null -ne $raw.shares) { $registry.shares = @($raw.shares) }
    return $registry
}
function Save-Registry {
    param($Registry)
    Protect-Store
    $temp = Join-Path $StoreDir ('managed-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try {
        $json = ConvertTo-Json -InputObject $Registry -Depth 10
        [IO.File]::WriteAllText($temp,$json,([Text.UTF8Encoding]::new($true)))
        if (Test-Path -LiteralPath $RegistryPath -PathType Leaf) {
            [IO.File]::Replace($temp,$RegistryPath,$null)
        } else {
            [IO.File]::Move($temp,$RegistryPath)
        }
    } finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
    }
}
function Assert-UserName {
    param([string]$Name)
    if ($Name -notmatch '^[A-Za-z][A-Za-z0-9_.-]{2,19}$' -or $Name.EndsWith('.')) {
        throw 'The account name must start with an English letter and be 3-20 characters in length. Only letters/numbers/_/./- are allowed.'
    }
    if ($Name -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$') { throw 'Use of device reserved names is prohibited.' }
}
function Assert-ShareName {
    param([string]$Name)
    if ($Name -match '^(pipe|mailslot)$') { throw 'The share name is an SMB reserved name.' }
    if ($Name -notmatch '^[A-Za-z0-9][A-Za-z0-9 _.-]{1,59}$' -or $Name.EndsWith('.') -or $Name.EndsWith(' ')) {
        throw 'The share name must be 2–60 English letters, numbers, spaces, underscores, dots, or hyphens; it cannot end with spaces/dots.'
    }
}
function Resolve-SafeDirectory {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path) -or $Path -notmatch '^[A-Za-z]:\\') { throw 'Please select the local absolute path starting with the drive letter (for example, D:\\LANShare). UNC/relative paths are not supported.' }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if (-not [IO.Path]::IsPathRooted($full) -or -not (Test-Path -LiteralPath $full -PathType Container)) {
        throw 'The shared directory does not exist or is not an absolute path.'
    }
    $driveRoot = [IO.Path]::GetPathRoot($full).TrimEnd('\')
    if ($full -eq $driveRoot) { throw 'Sharing of disk root directory is prohibited.' }
    $forbidden = @(
        (Join-Path $env:SystemDrive 'Windows'), (Join-Path $env:SystemDrive 'Users'),
        (Join-Path $env:SystemDrive 'Program Files'), (Join-Path $env:SystemDrive 'Program Files (x86)'),
        $env:ProgramData
    )
    foreach ($prefix in $forbidden) {
        if ($full.Equals($prefix,[StringComparison]::OrdinalIgnoreCase) -or
            $full.StartsWith($prefix.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) {
            throw ('Disallow sharing of system/configuration directories:' + $full)
        }
    }
    # Guard against junction/symlink paths (including any ancestor folder).
    $current = [IO.DirectoryInfo]::new($full)
    while ($null -ne $current) {
        if (($current.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'The folder path contains a symbolic link or Junction, and modification of its ACL is denied.'
        }
        $current = $current.Parent
    }
    return $full
}
function New-RandomPassword {
    $alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_'
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        do {
            $bytes=New-Object byte[] 24
            $rng.GetBytes($bytes)
            $password=-join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
        } while ($password -notmatch '[A-Z]' -or $password -notmatch '[a-z]' -or
                 $password -notmatch '[0-9]' -or $password -notmatch '[^A-Za-z0-9]')
        return $password
    } finally { $rng.Dispose() }
}
function Find-ManagedUser {
    param($Registry,[string]$Name)
    $found = @($Registry.users | Where-Object { $_.name -eq $Name })
    if ($found.Count -ne 1) { throw 'Only special accounts created and registered by this software can be operated.' }
    $user=Get-LocalUser -Name $Name -ErrorAction Stop
    if ($user.Description -ne $UserMarker -or [string]$user.SID.Value -ne [string]$found[0].sid) {
        throw 'The Windows local account is inconsistent with the hosting record, and the operation has been rejected.'
    }
    return $user
}
function Find-ManagedShare {
    param($Registry,[string]$Name)
    $entries=@($Registry.shares | Where-Object { $_.name -eq $Name })
    if ($entries.Count -ne 1) { throw 'Only shares registered with this software can be deleted.' }
    $existing=Get-SmbShare -Name $Name -ErrorAction SilentlyContinue
    if ($null -ne $existing -and ($existing.Description -ne $ShareMarker -or
        -not $existing.Path.Equals([string]$entries[0].path,[StringComparison]::OrdinalIgnoreCase))) {
        throw 'The shared path or hosted tag has been modified externally and the operation has been denied.'
    }
    return $entries[0]
}
function Get-AceSid {
    param($Ace)
    try { return [string]$Ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value }
    catch { return '' }
}
function New-NtfsRule {
    param($Sid,[string]$Right)
    $fsRight=if ($Right -eq 'Read') {
        [Security.AccessControl.FileSystemRights]::ReadAndExecute
    } else { [Security.AccessControl.FileSystemRights]::Modify }
    $inheritance=[Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    return ([Security.AccessControl.FileSystemAccessRule]::new($Sid,$fsRight,$inheritance,
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Allow))
}
function Remove-ManagedNtfsRule {
    param($Entry)
    if (-not ($Entry.PSObject.Properties.Name -contains 'ntfsAdded') -or -not $Entry.ntfsAdded) { return }
    $path=[string]$Entry.path
    if (-not (Test-Path -LiteralPath $path -PathType Container)) {
        throw ('The share entry has been removed, but the original directory does not exist and its NTFS authorization cannot be automatically cleared:' + $path)
    }
    $path=Resolve-SafeDirectory $path
    $sid=[Security.Principal.SecurityIdentifier]::new([string]$Entry.accountSid)
    $rule=New-NtfsRule -Sid $sid -Right ([string]$Entry.right)
    $acl=Get-Acl -LiteralPath $path
    [void]$acl.RemoveAccessRuleSpecific($rule)
    Set-Acl -LiteralPath $path -AclObject $acl
}


# Existing Windows objects can be edited if verified against a specific SID.
# Built-in accounts, administrator-group members and the active login are blocked.
function Find-SafeExistingUser {
    param([string]$Name,[string]$ExpectedSid)
    if ([string]::IsNullOrWhiteSpace($Name) -or [string]::IsNullOrWhiteSpace($ExpectedSid)) {
        throw 'Account name and snapshot SID must be specified.'
    }
    $u=Get-LocalUser -Name $Name -ErrorAction Stop
    if ([string]$u.SID.Value -ne $ExpectedSid) { throw 'The account identity has changed. Please refresh the system status and try again.' }
    if ($ExpectedSid -notmatch '^S-1-5-21-(\d+-){3}\d+$') { throw 'Modification of non-local SAM accounts is not allowed.' }
    if ($ExpectedSid -match '-(500|501|503|504)$') { throw 'Modification of built-in Windows accounts is prohibited.' }
    if ($ExpectedSid -eq ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)) { throw 'It is forbidden to modify the account currently running the management process.' }
    $adminGroup=Get-LocalGroup -SID 'S-1-5-32-544' -ErrorAction Stop
    $adminMembers=@(Get-LocalGroupMember -Group $adminGroup -ErrorAction Stop)
    if (@($adminMembers | Where-Object { $null -ne $_.SID -and $_.SID.Value -eq $ExpectedSid }).Count -gt 0) {
        throw 'It is forbidden to modify the members of the local administrator group through SwitchLAN.'
    }
    return $u
}
function Find-SafeOrdinaryShare {
    param([string]$Name,[switch]$AllowMissingPath)
    if ([string]::IsNullOrWhiteSpace($Name) -or $Name.EndsWith('$') -or $Name -match '[*?\[\]]') { throw 'Modification of system/hidden shares or wildcard names is not allowed.' }
    $share=Get-SmbShare -Name $Name -ErrorAction Stop
    if ($share.Special -or [string]::IsNullOrWhiteSpace([string]$share.Path)) { throw 'Unable to manage Windows system shares.' }
    if (-not $AllowMissingPath -and -not (Test-Path -LiteralPath ([string]$share.Path) -PathType Container)) { throw 'The shared directory is unavailable, please check the path first.' }
    return $share
}

# Resolve the Windows principal SID rather than relying on one display-name format.
# A Windows update or localized system may render local accounts differently.
function Test-ShareAceMatchesSid {
    param($Ace,[string]$ExpectedSid,[string]$FallbackPrincipal)
    if ([string]$Ace.AccountName -eq $FallbackPrincipal) { return $true }
    try {
        $nt=[Security.Principal.NTAccount]::new([string]$Ace.AccountName)
        return ($nt.Translate([Security.Principal.SecurityIdentifier]).Value -eq $ExpectedSid)
    } catch { return $false }
}

try {
    if (-not (Test-IsAdministrator)) { throw 'Administrator rights required. Please use the local administrator account to run the desktop program.' }
    if (-not (Test-Path -LiteralPath $RequestPath -PathType Leaf)) { throw 'The requested file does not exist.' }
    $request = [IO.File]::ReadAllText($RequestPath,[Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($null -eq $request -or -not $request.action -or -not $request.callerSid) { throw 'The request format is invalid.' }
    $selfSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    if ([string]$request.callerSid -ne $selfSid) {
        throw 'UAC uses another administrator account. Please log in to Windows with an administrator account before starting SwitchLAN to avoid reading the request/result directories of different users.'
    }
    $action=[string]$request.action
    Protect-Store
    $registry=Read-Registry
    $data=$null
    switch ($action) {
        'update-existing-user' {
            $name=[string]$request.name
            $user=Find-SafeExistingUser -Name $name -ExpectedSid ([string]$request.sid)
            $fullName=[string]$request.fullName
            $description=[string]$request.description
            if ($fullName.Length -gt 100 -or $description.Length -gt 240 -or
                $fullName -match '[\x00-\x1f]' -or $description -match '[\x00-\x1f]') { throw 'The name or comment contains invalid characters or exceeds the length limit.' }
            if ($user.Description -eq $UserMarker) {
                # Description is the ownership proof for managed accounts.
                Set-LocalUser -Name $name -FullName $fullName -ErrorAction Stop
            } else {
                Set-LocalUser -Name $name -FullName $fullName -Description $description -ErrorAction Stop
            }
            $data=[ordered]@{ name=$name; fullName=$fullName; description=$(if($user.Description -eq $UserMarker){$UserMarker}else{$description}) }
        }
        'set-existing-user-enabled' {
            $name=[string]$request.name
            $user=Find-SafeExistingUser -Name $name -ExpectedSid ([string]$request.sid)
            if ($null -eq $request.enabled -or $request.enabled -isnot [bool]) { throw 'enabled must be a Boolean value.' }
            if ([bool]$request.enabled) { Enable-LocalUser -Name $name -ErrorAction Stop }
            else { Disable-LocalUser -Name $name -ErrorAction Stop }
            $data=[ordered]@{name=$name;enabled=[bool]$request.enabled}
        }
        'set-existing-user-password' {
            $name=[string]$request.name
            $user=Find-SafeExistingUser -Name $name -ExpectedSid ([string]$request.sid)
            $newPassword=[string]$request.password
            if ($newPassword.Length -lt 1 -or $newPassword.Length -gt 128 -or
                $newPassword -match '[\x00-\x1f\x7f]') {
                throw 'Passwords must be 1–128 characters long and cannot contain control characters; final requirements are subject to Windows native password policy.'
            }
            Set-LocalUser -Name $name -Password (ConvertTo-SecureString $newPassword -AsPlainText -Force) -ErrorAction Stop
            # Do not return, log or store the password after Windows accepts it.
            $newPassword=$null
            $data=[ordered]@{name=$name;customPasswordSet=$true}
        }
        'reset-existing-user-password' {
            $name=[string]$request.name
            $user=Find-SafeExistingUser -Name $name -ExpectedSid ([string]$request.sid)
            $password=New-RandomPassword
            Set-LocalUser -Name $name -Password (ConvertTo-SecureString $password -AsPlainText -Force) -ErrorAction Stop
            $data=[ordered]@{name=$name;password=$password}
        }
        'update-share-description' {
            $name=[string]$request.name
            $share=Find-SafeOrdinaryShare -Name $name
            if (@($registry.shares | Where-Object { [string]$_.name -eq $name }).Count -gt 0) {
                throw 'SwitchLAN hosted sharing relies on the description tag for security verification, and direct modification of this tag is not allowed.'
            }
            $expectedPath=[string]$request.expectedPath
            $expectedDescription=[string]$request.expectedDescription
            $description=[string]$request.description
            if ([string]::IsNullOrWhiteSpace($expectedPath) -or
                -not [string]::Equals([string]$share.Path,$expectedPath,[StringComparison]::OrdinalIgnoreCase) -or
                -not [string]::Equals([string]$share.Description,$expectedDescription,[StringComparison]::Ordinal)) {
                throw 'The shared path or remarks have changed and are not written; please read the Windows status again.'
            }
            if ($description.Length -gt 256 -or $description -match '[\x00-\x1f]') {
                throw 'Shared notes can have a maximum of 256 characters, and no control characters are allowed.'
            }
            Set-SmbShare -Name $name -Description $description -Force -ErrorAction Stop | Out-Null
            $actual=Get-SmbShare -Name $name -ErrorAction Stop
            if (-not [string]::Equals([string]$actual.Description,$description,[StringComparison]::Ordinal)) {
                throw 'Windows has accepted the operation but the remark verification failed, please confirm manually.'
            }
            $data=[ordered]@{name=$name;path=$expectedPath;description=$description;oldDescription=$expectedDescription}
        }
        'modify-share-access' {
            $name=[string]$request.name
            $share=Find-SafeOrdinaryShare -Name $name
            $account=[string]$request.account
            $target=Find-SafeExistingUser -Name $account -ExpectedSid ([string]$request.sid)
            $right=[string]$request.right
            if ($right -notin @('Read','Change','Remove')) { throw 'The permissions can only be selected as Read, Change or Remove.' }
            $principal=$env:COMPUTERNAME+'\'+$target.Name
            # Optimistic concurrency: do not overwrite a newer setting or another share path.
            $expectedPath=[string]$request.expectedPath
            $expectedRight=[string]$request.expectedRight
            if ($expectedPath.Length -eq 0 -or $expectedRight -notin @('None','Read','Change','Full')) {
                throw 'Valid original sharing permission information is missing, please refresh the interface and try again.'
            }
            if (-not [string]::Equals([string]$share.Path,$expectedPath,[StringComparison]::OrdinalIgnoreCase)) {
                throw 'The sharing path has changed. Please refresh the status and try again. No permissions have been modified.'
            }
            $before=@(Get-SmbShareAccess -Name $name -ErrorAction Stop)
            $current=@($before | Where-Object {
                Test-ShareAceMatchesSid -Ace $_ -ExpectedSid ([string]$target.SID.Value) -FallbackPrincipal $principal
            })
            if (@($current | Where-Object { $_.AccessControlType -eq 'Deny' }).Count -gt 0) {
                throw 'The target account has a deny ACE and cannot be safely adjusted in this operation.'
            }
            $oldAllow=@($current | Where-Object { $_.AccessControlType -eq 'Allow' })
            $oldRight=if ($oldAllow.Count -eq 1) { [string]$oldAllow[0].AccessRight } else { '' }
            if ($oldAllow.Count -gt 1) { throw 'Duplicate share authorization is found, please use Windows management tools to check first.' }
            $currentRight=if ($oldAllow.Count -eq 0) { 'None' } else { $oldRight }
            if ($currentRight -ne $expectedRight) {
                throw ('The user permissions have changed (original interface:'+$expectedRight+';Now:'+$currentRight+'), no modification has been performed, please refresh.')
            }
            # Only touch the chosen account. Never silently edit Everyone, groups or NTFS.
            $revoked=$false
            try {
                if ($oldAllow.Count -gt 0) {
                    Revoke-SmbShareAccess -Name $name -AccountName $principal -Force -ErrorAction Stop | Out-Null
                    $revoked=$true
                }
                if ($right -ne 'Remove') {
                    Grant-SmbShareAccess -Name $name -AccountName $principal -AccessRight $right -Force -ErrorAction Stop | Out-Null
                }
                $after=@(Get-SmbShareAccess -Name $name -ErrorAction Stop | Where-Object {
                    $_.AccessControlType -eq 'Allow' -and
                    (Test-ShareAceMatchesSid -Ace $_ -ExpectedSid ([string]$target.SID.Value) -FallbackPrincipal $principal)
                })
                if ($right -eq 'Remove') {
                    if ($after.Count -gt 0) { throw 'Authorization for this account was still detected after revocation.' }
                } elseif ($after.Count -ne 1 -or [string]$after[0].AccessRight -ne $right) {
                    throw 'The permissions returned by Windows after modification are inconsistent with expectations.'
                }
            } catch {
                $reason=$_.Exception.Message
                try {
                    Revoke-SmbShareAccess -Name $name -AccountName $principal -Force -ErrorAction SilentlyContinue | Out-Null
                    if ($oldAllow.Count -gt 0 -and $oldRight -in @('Read','Change','Full')) {
                        Grant-SmbShareAccess -Name $name -AccountName $principal -AccessRight $oldRight -Force -ErrorAction Stop | Out-Null
                    }
                } catch { throw ('The share permission modification failed and the rollback also failed. Please use Windows to check immediately:'+$reason+'；'+$_.Exception.Message) }
                throw ('Sharing permission modification failed. An attempt has been made to restore the original authorization:'+$reason)
            }
            $data=[ordered]@{name=$name;account=$principal;right=$right;ntfsUnchanged=$true}
        }
        'delete-existing-user' {
            $name=[string]$request.name
            $sid=[string]$request.sid
            $user=Find-SafeExistingUser -Name $name -ExpectedSid $sid
            # Never silently orphan shares or managed metadata; an admin can
            # revoke those grants first, then retry the removal.
            if (@($registry.shares | Where-Object { [string]$_.accountSid -eq $sid }).Count -gt 0) {
                throw 'The account is still referenced by the SwitchLAN hosting share. Please stop associated sharing first.'
            }
            foreach ($share in @(Get-SmbShare -ErrorAction Stop | Where-Object { -not $_.Special })) {
                $direct=@(Get-SmbShareAccess -Name ([string]$share.Name) -ErrorAction Stop | Where-Object {
                    Test-ShareAceMatchesSid -Ace $_ -ExpectedSid $sid -FallbackPrincipal ($env:COMPUTERNAME+'\'+$name)
                })
                if ($direct.Count -gt 0) {
                    throw ('This account still has shares '+[string]$share.Name+' Direct authorization; please revoke the account''s permissions before deleting it.')
                }
            }
            # Core 1.3.1: deletion does NOT perform implicit NTFS changes.
            # An ACL cleanup requires a separate, scope-reviewed operation; no
            # such operation is enabled in this release. Preserve all user data.
            if (-not ($request.PSObject.Properties.Name -contains 'preserveNtfs') -or
                $request.preserveNtfs -isnot [bool] -or -not [bool]$request.preserveNtfs) {
                throw 'Please confirm: deleting the account only deletes the identity, and the NTFS permissions and disk files remain intact.'
            }
            Remove-LocalUser -Name $name -ErrorAction Stop
            $registry.users=@($registry.users | Where-Object { [string]$_.sid -ne $sid })
            # A local user has already been removed: don't claim the whole
            # operation failed if only bookkeeping failed.
            try { Save-Registry $registry }
            catch { throw ('The account has been deleted from Windows, but the record failed to save, please check manually:'+$_.Exception.Message) }
            $data=[ordered]@{ name=$name; sid=$sid; profileKept=$true; filesKept=$true;
                cleanedShareRoots=0; ntfsUnchanged=$true;
                note='Only removes the local account identity, does not delete files or change any NTFS ACLs. Orphaned SIDs may remain; they need to be checked individually and cleaned up after manual review.' }
        }
        'unshare-existing' {
            $name=[string]$request.name
            $expectedPath=[string]$request.expectedPath
            if ([string]::IsNullOrWhiteSpace($expectedPath)) { throw 'The shared path must be provided before the operation.' }
            $share=Find-SafeOrdinaryShare -Name $name -AllowMissingPath
            if (-not [string]::Equals([string]$share.Path,$expectedPath,[StringComparison]::OrdinalIgnoreCase)) {
                throw 'The actual shared path has changed and the operation has been stopped. Please refresh and try again.'
            }
            $managed=@($registry.shares | Where-Object { [string]$_.name -eq $name })
            if ($managed.Count -gt 0) {
                $entry=Find-ManagedShare $registry $name
                # A managed share has an NTFS rule created by this application.
                # Leave the registry entry available for cleanup retry on failure.
                Remove-SmbShare -Name $name -Force -ErrorAction Stop
                try { Remove-ManagedNtfsRule $entry }
                catch { throw ('The SMB share was canceled but the original NTFS authorization cleanup failed. Keep managed records for retry:'+$_.Exception.Message) }
                $registry.shares=@($registry.shares | Where-Object { [string]$_.name -ne $name })
                Save-Registry $registry
                $data=[ordered]@{name=$name;path=$expectedPath;filesKept=$true;ntfsRuleRemoved=$true}
            } else {
                # Existing ordinary Windows shares: SMB entry only. Do not
                # touch NTFS ACLs, file contents, or unrelated Windows shares.
                Remove-SmbShare -Name $name -Force -ErrorAction Stop
                $data=[ordered]@{name=$name;path=$expectedPath;filesKept=$true;ntfsUnchanged=$true}
            }
        }
        'create-user' {
            $name=[string]$request.name; Assert-UserName $name
            if ($null -ne (Get-LocalUser -Name $name -ErrorAction SilentlyContinue)) { throw ('Account already exists:'+$name) }
            $passwordMode=[string]$request.passwordMode
            if ($passwordMode -eq 'custom') {
                $password=[string]$request.password
                if ($password.Length -lt 1 -or $password.Length -gt 128 -or $password -match '[\x00-\x1f\x7f]') {
                    throw 'Password must be 1–128 characters long and contain no control characters. Windows'' native password policy may reject weak passwords.'
                }
            } elseif ($passwordMode -eq '' -or $passwordMode -eq 'generate') {
                $password=New-RandomPassword
            } else { throw 'Invalid password setting method.' }
            $secure=ConvertTo-SecureString $password -AsPlainText -Force
            New-LocalUser -Name $name -Password $secure -AccountNeverExpires -PasswordNeverExpires `
                -Description $UserMarker -ErrorAction Stop | Out-Null
            try {
                $user=Get-LocalUser -Name $name -ErrorAction Stop
                $registry.users=@($registry.users)+[pscustomobject]@{
                    name=$name; sid=[string]$user.SID.Value;
                    createdAt=(Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')
                }
                Save-Registry $registry
            } catch {
                $reason=$_.Exception.Message
                try { Remove-LocalUser -Name $name -ErrorAction Stop }
                catch { throw ('The hosting record failed to be saved and the new user cannot be rolled back. '+$name+'; Please check manually.'+$reason) }
                throw ('The hosting record failed to be saved and the new user has been rolled back:'+$reason)
            }
            $data=[ordered]@{ name=$name; sid=[string]$user.SID.Value;
                password=$(if($passwordMode -eq 'custom'){$null}else{$password});customPasswordSet=($passwordMode -eq 'custom') }
        }
        'delete-user' {
            $name=[string]$request.name; Assert-UserName $name
            if (@($registry.shares | Where-Object { $_.account -eq $name }).Count -gt 0) {
                throw 'This account still has associated managed shares. Please delete these shares before deleting the account.'
            }
            $user=Find-ManagedUser $registry $name
            $adminGroup=Get-LocalGroup -SID 'S-1-5-32-544' -ErrorAction Stop
            $isAdmin=@(Get-LocalGroupMember -Group $adminGroup -ErrorAction Stop | Where-Object {
                $null -ne $_.SID -and $_.SID.Value -eq $user.SID.Value
            }).Count -gt 0
            if ($isAdmin) { throw 'Rejection of removal of Administrators group members.' }
            Remove-LocalUser -Name $name -ErrorAction Stop
            $registry.users=@($registry.users | Where-Object { $_.name -ne $name })
            Save-Registry $registry
            $data=[ordered]@{name=$name; profileKept=$true}
        }
        'set-user-enabled' {
            $name=[string]$request.name; Assert-UserName $name
            $user=Find-ManagedUser $registry $name
            if ($null -eq $request.enabled -or $request.enabled -isnot [bool]) { throw 'enabled must be a Boolean value.' }
            if ([bool]$request.enabled) {
                Enable-LocalUser -Name $name -ErrorAction Stop
            } else {
                Disable-LocalUser -Name $name -ErrorAction Stop
            }
            $data=[ordered]@{name=$name; enabled=[bool]$request.enabled}
        }
        'reset-user-password' {
            $name=[string]$request.name; Assert-UserName $name
            $user=Find-ManagedUser $registry $name
            $password=New-RandomPassword
            Set-LocalUser -Name $name -Password (ConvertTo-SecureString $password -AsPlainText -Force) -ErrorAction Stop
            $data=[ordered]@{name=$name; password=$password}
        }
        'create-share' {
            $name=[string]$request.name; Assert-ShareName $name
            $account=[string]$request.account
            $right=[string]$request.right
            if ($right -notin @('Read','Change')) { throw 'Only Read or Change can be selected.' }
            $path=Resolve-SafeDirectory ([string]$request.path)
            if ($null -ne (Get-SmbShare -Name $name -ErrorAction SilentlyContinue)) { throw ('Share name already exists:'+$name) }
            if (@($registry.shares | Where-Object { $_.path -eq $path }).Count -gt 0) {
                throw 'This folder already has a SwitchLAN managed share. To prevent NTFS cleanup conflicts, multiple shares of the same path are not currently supported.'
            }
            $user=Find-SafeExistingUser -Name $account -ExpectedSid ([string]$request.accountSid)
            if (-not $user.Enabled) { throw 'The target account is disabled.' }
            $sid=$user.SID
            $acl=Get-Acl -LiteralPath $path
            $explicit=@($acl.Access | Where-Object { -not $_.IsInherited -and (Get-AceSid $_) -eq $sid.Value })
            if ($explicit.Count -gt 0) {
                throw 'This user already has explicit NTFS permissions on this folder. Please use a clean shared directory to avoid overwriting or amplifying existing permissions.'
            }
            $rule=New-NtfsRule -Sid $sid -Right $right
            $createdShare=$false
            $aclAdded=$false
            try {
                [void]$acl.AddAccessRule($rule)
                Set-Acl -LiteralPath $path -AclObject $acl
                $aclAdded=$true
                $localAccount=$env:COMPUTERNAME+'\'+$account
                if ($right -eq 'Read') {
                    New-SmbShare -Name $name -Path $path -ReadAccess $localAccount `
                        -Description $ShareMarker -ErrorAction Stop | Out-Null
                } else {
                    New-SmbShare -Name $name -Path $path -ChangeAccess $localAccount `
                        -Description $ShareMarker -ErrorAction Stop | Out-Null
                }
                $createdShare=$true
                $shareAccess=@(Get-SmbShareAccess -Name $name -ErrorAction Stop)
                if (@($shareAccess | Where-Object {
                    $_.AccessControlType -eq 'Allow' -and
                    ($_.AccountName -match '^(Everyone|S-1-1-0)$')
                }).Count -gt 0) {
                    throw 'The newly created share has been granted Everyone permission by the system and has triggered rollback.'
                }
                $matchingAccount=@($shareAccess | Where-Object {
                    $_.AccessControlType -eq 'Allow' -and
                    $_.AccountName -eq $localAccount -and
                    [string]$_.AccessRight -eq $right
                })
                if ($matchingAccount.Count -eq 0) {
                    throw 'Windows did not confirm SMB authorization for the target account and a rollback was triggered.'
                }
                # Persist the exact NTFS ACE we added so deletion can reverse it.
                $registry.shares=@($registry.shares)+[pscustomobject]@{
                    name=$name; path=$path; account=$account; accountSid=[string]$sid.Value;
                    right=$right; ntfsAdded=$true;
                    createdAt=(Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')
                }
                Save-Registry $registry
            } catch {
                $reason=$_.Exception.Message; $rollbackErrors=@()
                if ($createdShare) {
                    try { Remove-SmbShare -Name $name -Force -ErrorAction Stop }
                    catch { $rollbackErrors+=('Shared rollback failed:'+$_.Exception.Message) }
                }
                if ($aclAdded) {
                    try {
                        $restoreAcl=Get-Acl -LiteralPath $path
                        [void]$restoreAcl.RemoveAccessRuleSpecific($rule)
                        Set-Acl -LiteralPath $path -AclObject $restoreAcl
                    } catch { $rollbackErrors+=('NTFS rollback failed:'+$_.Exception.Message) }
                }
                if ($rollbackErrors.Count -gt 0) {
                    throw ('The creation failed and the rollback was incomplete. Please check the share/ACL manually. reason:'+$reason+'；'+($rollbackErrors -join '；'))
                }
                throw ('Creation failed, rollback attempted:'+$reason)
            }
            $data=[ordered]@{name=$name; path=$path; account=$account; right=$right}
        }
        'delete-share' {
            $name=[string]$request.name; Assert-ShareName $name
            $entry=Find-ManagedShare $registry $name
            $existing=Get-SmbShare -Name $name -ErrorAction SilentlyContinue
            if ($null -ne $existing) { Remove-SmbShare -Name $name -Force -ErrorAction Stop }
            # If ACL cleanup fails, keep registry entry for a safe retry.
            Remove-ManagedNtfsRule $entry
            $registry.shares=@($registry.shares | Where-Object { $_.name -ne $name })
            Save-Registry $registry
            $data=[ordered]@{name=$name; filesKept=$true; ntfsRuleRemoved=$true}
        }
        default { throw ('Unsupported operation:'+$action) }
    }
    Write-Result -Ok $true -Message 'Windows operation complete.' -Data $data
    exit 0
} catch {
    try { Write-Result -Ok $false -Message $_.Exception.Message -Data $null } catch { }
    exit 1
}
