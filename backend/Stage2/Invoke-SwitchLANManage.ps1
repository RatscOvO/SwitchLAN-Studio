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
        throw '托管数据目录是重解析点，拒绝写入。'
    }
    if ((Test-Path -LiteralPath $RegistryPath -PathType Leaf) -and
        (((Get-Item -LiteralPath $RegistryPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
        throw '托管数据文件是重解析点，拒绝写入。'
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
    if ($null -eq $raw -or $raw.schemaVersion -ne 1) { throw '托管清单版本不受支持。' }
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
        throw '账户名须以英文字母开头，长度 3–20 位，只允许字母/数字/_/./-。'
    }
    if ($Name -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$') { throw '禁止使用设备保留名。' }
}
function Assert-ShareName {
    param([string]$Name)
    if ($Name -match '^(pipe|mailslot)$') { throw '共享名称是 SMB 保留名称。' }
    if ($Name -notmatch '^[A-Za-z0-9][A-Za-z0-9 _.-]{1,59}$' -or $Name.EndsWith('.') -or $Name.EndsWith(' ')) {
        throw '共享名为 2–60 位英文字母、数字、空格、下划线、点或连字符；不能以空格/点结尾。'
    }
}
function Resolve-SafeDirectory {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path) -or $Path -notmatch '^[A-Za-z]:\\') { throw '请选择盘符开头的本机绝对路径（例如 D:\\LANShare），不支持 UNC/相对路径。' }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if (-not [IO.Path]::IsPathRooted($full) -or -not (Test-Path -LiteralPath $full -PathType Container)) {
        throw '共享目录不存在或不是绝对路径。'
    }
    $driveRoot = [IO.Path]::GetPathRoot($full).TrimEnd('\')
    if ($full -eq $driveRoot) { throw '禁止共享磁盘根目录。' }
    $forbidden = @(
        (Join-Path $env:SystemDrive 'Windows'), (Join-Path $env:SystemDrive 'Users'),
        (Join-Path $env:SystemDrive 'Program Files'), (Join-Path $env:SystemDrive 'Program Files (x86)'),
        $env:ProgramData
    )
    foreach ($prefix in $forbidden) {
        if ($full.Equals($prefix,[StringComparison]::OrdinalIgnoreCase) -or
            $full.StartsWith($prefix.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) {
            throw ('禁止共享系统/配置目录：' + $full)
        }
    }
    # Guard against junction/symlink paths (including any ancestor folder).
    $current = [IO.DirectoryInfo]::new($full)
    while ($null -ne $current) {
        if (($current.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw '文件夹路径包含符号链接或 Junction，拒绝修改其 ACL。'
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
    if ($found.Count -ne 1) { throw '只能操作本软件创建并登记的专用账户。' }
    $user=Get-LocalUser -Name $Name -ErrorAction Stop
    if ($user.Description -ne $UserMarker -or [string]$user.SID.Value -ne [string]$found[0].sid) {
        throw 'Windows 本地账户与托管记录不一致，已拒绝操作。'
    }
    return $user
}
function Find-ManagedShare {
    param($Registry,[string]$Name)
    $entries=@($Registry.shares | Where-Object { $_.name -eq $Name })
    if ($entries.Count -ne 1) { throw '只能删除本软件登记的共享。' }
    $existing=Get-SmbShare -Name $Name -ErrorAction SilentlyContinue
    if ($null -ne $existing -and ($existing.Description -ne $ShareMarker -or
        -not $existing.Path.Equals([string]$entries[0].path,[StringComparison]::OrdinalIgnoreCase))) {
        throw '共享路径或托管标记被外部修改，已拒绝操作。'
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
        throw ('共享入口已移除，但原目录不存在，无法自动清理其 NTFS 授权：' + $path)
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
        throw '必须指定账户名称和快照 SID。'
    }
    $u=Get-LocalUser -Name $Name -ErrorAction Stop
    if ([string]$u.SID.Value -ne $ExpectedSid) { throw '账户身份已变化，请刷新系统状态后重试。' }
    if ($ExpectedSid -notmatch '^S-1-5-21-(\d+-){3}\d+$') { throw '不允许修改非本地 SAM 账户。' }
    if ($ExpectedSid -match '-(500|501|503|504)$') { throw 'Windows 内置账户禁止修改。' }
    if ($ExpectedSid -eq ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)) { throw '禁止修改当前运行管理进程的账户。' }
    $adminGroup=Get-LocalGroup -SID 'S-1-5-32-544' -ErrorAction Stop
    $adminMembers=@(Get-LocalGroupMember -Group $adminGroup -ErrorAction Stop)
    if (@($adminMembers | Where-Object { $null -ne $_.SID -and $_.SID.Value -eq $ExpectedSid }).Count -gt 0) {
        throw '禁止通过 SwitchLAN 修改本机管理员组成员。'
    }
    return $u
}
function Find-SafeOrdinaryShare {
    param([string]$Name,[switch]$AllowMissingPath)
    if ([string]::IsNullOrWhiteSpace($Name) -or $Name.EndsWith('$') -or $Name -match '[*?\[\]]') { throw '系统/隐藏共享或通配名称不允许修改。' }
    $share=Get-SmbShare -Name $Name -ErrorAction Stop
    if ($share.Special -or [string]::IsNullOrWhiteSpace([string]$share.Path)) { throw '无法管理 Windows 系统共享。' }
    if (-not $AllowMissingPath -and -not (Test-Path -LiteralPath ([string]$share.Path) -PathType Container)) { throw '共享目录不可用，请先检查路径。' }
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
    if (-not (Test-IsAdministrator)) { throw '需要管理员权限。请用本机管理员账户运行桌面程序。' }
    if (-not (Test-Path -LiteralPath $RequestPath -PathType Leaf)) { throw '请求文件不存在。' }
    $request = [IO.File]::ReadAllText($RequestPath,[Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($null -eq $request -or -not $request.action -or -not $request.callerSid) { throw '请求格式无效。' }
    $selfSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    if ([string]$request.callerSid -ne $selfSid) {
        throw 'UAC 使用了另一个管理员账户。请先用管理员账户登录 Windows 再启动 SwitchLAN，以免读取不同用户的请求/结果目录。'
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
                $fullName -match '[\x00-\x1f]' -or $description -match '[\x00-\x1f]') { throw '姓名或备注包含无效字符，或超过长度限制。' }
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
            if ($null -eq $request.enabled -or $request.enabled -isnot [bool]) { throw 'enabled 必须是布尔值。' }
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
                throw '密码必须为 1–128 位，且不能包含控制字符；最终要求以 Windows 本机密码策略为准。'
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
                throw 'SwitchLAN 托管共享依赖描述标记进行安全核验，不允许直接修改此标记。'
            }
            $expectedPath=[string]$request.expectedPath
            $expectedDescription=[string]$request.expectedDescription
            $description=[string]$request.description
            if ([string]::IsNullOrWhiteSpace($expectedPath) -or
                -not [string]::Equals([string]$share.Path,$expectedPath,[StringComparison]::OrdinalIgnoreCase) -or
                -not [string]::Equals([string]$share.Description,$expectedDescription,[StringComparison]::Ordinal)) {
                throw '共享路径或备注发生变化，未写入；请重新读取 Windows 状态。'
            }
            if ($description.Length -gt 256 -or $description -match '[\x00-\x1f]') {
                throw '共享备注最多 256 字符，不允许控制字符。'
            }
            Set-SmbShare -Name $name -Description $description -Force -ErrorAction Stop | Out-Null
            $actual=Get-SmbShare -Name $name -ErrorAction Stop
            if (-not [string]::Equals([string]$actual.Description,$description,[StringComparison]::Ordinal)) {
                throw 'Windows 已接受操作但备注核验失败，请手动确认。'
            }
            $data=[ordered]@{name=$name;path=$expectedPath;description=$description;oldDescription=$expectedDescription}
        }
        'modify-share-access' {
            $name=[string]$request.name
            $share=Find-SafeOrdinaryShare -Name $name
            $account=[string]$request.account
            $target=Find-SafeExistingUser -Name $account -ExpectedSid ([string]$request.sid)
            $right=[string]$request.right
            if ($right -notin @('Read','Change','Remove')) { throw '权限只能选择 Read、Change 或 Remove。' }
            $principal=$env:COMPUTERNAME+'\'+$target.Name
            # Optimistic concurrency: do not overwrite a newer setting or another share path.
            $expectedPath=[string]$request.expectedPath
            $expectedRight=[string]$request.expectedRight
            if ($expectedPath.Length -eq 0 -or $expectedRight -notin @('None','Read','Change','Full')) {
                throw '缺少有效的原始共享权限信息，请刷新界面后重试。'
            }
            if (-not [string]::Equals([string]$share.Path,$expectedPath,[StringComparison]::OrdinalIgnoreCase)) {
                throw '共享路径已变化，请刷新状态后重试，未修改任何权限。'
            }
            $before=@(Get-SmbShareAccess -Name $name -ErrorAction Stop)
            $current=@($before | Where-Object {
                Test-ShareAceMatchesSid -Ace $_ -ExpectedSid ([string]$target.SID.Value) -FallbackPrincipal $principal
            })
            if (@($current | Where-Object { $_.AccessControlType -eq 'Deny' }).Count -gt 0) {
                throw '目标账户存在拒绝 ACE，无法在此操作中安全调整。'
            }
            $oldAllow=@($current | Where-Object { $_.AccessControlType -eq 'Allow' })
            $oldRight=if ($oldAllow.Count -eq 1) { [string]$oldAllow[0].AccessRight } else { '' }
            if ($oldAllow.Count -gt 1) { throw '发现重复共享授权，请用 Windows 管理工具先检查。' }
            $currentRight=if ($oldAllow.Count -eq 0) { 'None' } else { $oldRight }
            if ($currentRight -ne $expectedRight) {
                throw ('该用户权限已发生变化（原界面：'+$expectedRight+'；现在：'+$currentRight+'），未执行修改，请刷新。')
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
                    if ($after.Count -gt 0) { throw '撤销后仍检测到该账户的授权。' }
                } elseif ($after.Count -ne 1 -or [string]$after[0].AccessRight -ne $right) {
                    throw '修改后 Windows 返回的权限与预期不一致。'
                }
            } catch {
                $reason=$_.Exception.Message
                try {
                    Revoke-SmbShareAccess -Name $name -AccountName $principal -Force -ErrorAction SilentlyContinue | Out-Null
                    if ($oldAllow.Count -gt 0 -and $oldRight -in @('Read','Change','Full')) {
                        Grant-SmbShareAccess -Name $name -AccountName $principal -AccessRight $oldRight -Force -ErrorAction Stop | Out-Null
                    }
                } catch { throw ('共享权限修改失败，回滚也失败，请立即用 Windows 检查：'+$reason+'；'+$_.Exception.Message) }
                throw ('共享权限修改失败，已尝试恢复原授权：'+$reason)
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
                throw '该账户仍被 SwitchLAN 托管共享引用。请先停止关联共享。'
            }
            foreach ($share in @(Get-SmbShare -ErrorAction Stop | Where-Object { -not $_.Special })) {
                $direct=@(Get-SmbShareAccess -Name ([string]$share.Name) -ErrorAction Stop | Where-Object {
                    Test-ShareAceMatchesSid -Ace $_ -ExpectedSid $sid -FallbackPrincipal ($env:COMPUTERNAME+'\'+$name)
                })
                if ($direct.Count -gt 0) {
                    throw ('该账户仍有共享 '+[string]$share.Name+' 的直接授权；请先撤销该账户的权限再删除。')
                }
            }
            # Core 1.3.1: deletion does NOT perform implicit NTFS changes.
            # An ACL cleanup requires a separate, scope-reviewed operation; no
            # such operation is enabled in this release. Preserve all user data.
            if (-not ($request.PSObject.Properties.Name -contains 'preserveNtfs') -or
                $request.preserveNtfs -isnot [bool] -or -not [bool]$request.preserveNtfs) {
                throw '请确认：删除账户只删除身份，NTFS 权限和磁盘文件保持原样。'
            }
            Remove-LocalUser -Name $name -ErrorAction Stop
            $registry.users=@($registry.users | Where-Object { [string]$_.sid -ne $sid })
            # A local user has already been removed: don't claim the whole
            # operation failed if only bookkeeping failed.
            try { Save-Registry $registry }
            catch { throw ('账户已从 Windows 删除，但记录保存失败，请手动核对：'+$_.Exception.Message) }
            $data=[ordered]@{ name=$name; sid=$sid; profileKept=$true; filesKept=$true;
                cleanedShareRoots=0; ntfsUnchanged=$true;
                note='仅删除本地账户身份，不删除文件或更改任何 NTFS ACL。孤立 SID 可能继续保留；需要单独检查并手动审核后清理。' }
        }
        'unshare-existing' {
            $name=[string]$request.name
            $expectedPath=[string]$request.expectedPath
            if ([string]::IsNullOrWhiteSpace($expectedPath)) { throw '必须提供操作前的共享路径。' }
            $share=Find-SafeOrdinaryShare -Name $name -AllowMissingPath
            if (-not [string]::Equals([string]$share.Path,$expectedPath,[StringComparison]::OrdinalIgnoreCase)) {
                throw '共享实际路径发生变化，已停止操作，请刷新后重试。'
            }
            $managed=@($registry.shares | Where-Object { [string]$_.name -eq $name })
            if ($managed.Count -gt 0) {
                $entry=Find-ManagedShare $registry $name
                # A managed share has an NTFS rule created by this application.
                # Leave the registry entry available for cleanup retry on failure.
                Remove-SmbShare -Name $name -Force -ErrorAction Stop
                try { Remove-ManagedNtfsRule $entry }
                catch { throw ('SMB 共享已取消，但原 NTFS 授权清理失败。保留托管记录供重试：'+$_.Exception.Message) }
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
            if ($null -ne (Get-LocalUser -Name $name -ErrorAction SilentlyContinue)) { throw ('账户已存在：'+$name) }
            $passwordMode=[string]$request.passwordMode
            if ($passwordMode -eq 'custom') {
                $password=[string]$request.password
                if ($password.Length -lt 1 -or $password.Length -gt 128 -or $password -match '[\x00-\x1f\x7f]') {
                    throw '密码必须为 1–128 位且不含控制字符。Windows 的本机密码策略可能拒绝弱密码。'
                }
            } elseif ($passwordMode -eq '' -or $passwordMode -eq 'generate') {
                $password=New-RandomPassword
            } else { throw '无效的密码设置方式。' }
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
                catch { throw ('托管记录保存失败，且无法回滚新建用户 '+$name+'；请人工核查。'+$reason) }
                throw ('托管记录保存失败，已回滚新建用户：'+$reason)
            }
            $data=[ordered]@{ name=$name; sid=[string]$user.SID.Value;
                password=$(if($passwordMode -eq 'custom'){$null}else{$password});customPasswordSet=($passwordMode -eq 'custom') }
        }
        'delete-user' {
            $name=[string]$request.name; Assert-UserName $name
            if (@($registry.shares | Where-Object { $_.account -eq $name }).Count -gt 0) {
                throw '该账户仍有关联的托管共享，请先删除这些共享，再删除账户。'
            }
            $user=Find-ManagedUser $registry $name
            $adminGroup=Get-LocalGroup -SID 'S-1-5-32-544' -ErrorAction Stop
            $isAdmin=@(Get-LocalGroupMember -Group $adminGroup -ErrorAction Stop | Where-Object {
                $null -ne $_.SID -and $_.SID.Value -eq $user.SID.Value
            }).Count -gt 0
            if ($isAdmin) { throw '拒绝删除管理员组成员。' }
            Remove-LocalUser -Name $name -ErrorAction Stop
            $registry.users=@($registry.users | Where-Object { $_.name -ne $name })
            Save-Registry $registry
            $data=[ordered]@{name=$name; profileKept=$true}
        }
        'set-user-enabled' {
            $name=[string]$request.name; Assert-UserName $name
            $user=Find-ManagedUser $registry $name
            if ($null -eq $request.enabled -or $request.enabled -isnot [bool]) { throw 'enabled 必须是布尔值。' }
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
            if ($right -notin @('Read','Change')) { throw '只能选择 Read 或 Change。' }
            $path=Resolve-SafeDirectory ([string]$request.path)
            if ($null -ne (Get-SmbShare -Name $name -ErrorAction SilentlyContinue)) { throw ('共享名已存在：'+$name) }
            if (@($registry.shares | Where-Object { $_.path -eq $path }).Count -gt 0) {
                throw '此文件夹已有 SwitchLAN 托管共享。为防止 NTFS 清理冲突，暂不支持同一路径多重共享。'
            }
            $user=Find-SafeExistingUser -Name $account -ExpectedSid ([string]$request.accountSid)
            if (-not $user.Enabled) { throw '目标账户已禁用。' }
            $sid=$user.SID
            $acl=Get-Acl -LiteralPath $path
            $explicit=@($acl.Access | Where-Object { -not $_.IsInherited -and (Get-AceSid $_) -eq $sid.Value })
            if ($explicit.Count -gt 0) {
                throw '该用户在此文件夹已有显式 NTFS 权限，请使用干净的共享目录，避免覆盖或放大既有授权。'
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
                    throw '新建共享被系统授予 Everyone 权限，已经触发回滚。'
                }
                $matchingAccount=@($shareAccess | Where-Object {
                    $_.AccessControlType -eq 'Allow' -and
                    $_.AccountName -eq $localAccount -and
                    [string]$_.AccessRight -eq $right
                })
                if ($matchingAccount.Count -eq 0) {
                    throw 'Windows 没有确认目标账户的 SMB 授权，已经触发回滚。'
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
                    catch { $rollbackErrors+=('共享回滚失败：'+$_.Exception.Message) }
                }
                if ($aclAdded) {
                    try {
                        $restoreAcl=Get-Acl -LiteralPath $path
                        [void]$restoreAcl.RemoveAccessRuleSpecific($rule)
                        Set-Acl -LiteralPath $path -AclObject $restoreAcl
                    } catch { $rollbackErrors+=('NTFS 回滚失败：'+$_.Exception.Message) }
                }
                if ($rollbackErrors.Count -gt 0) {
                    throw ('创建失败且回滚不完全，请人工检查共享/ACL。原因：'+$reason+'；'+($rollbackErrors -join '；'))
                }
                throw ('创建失败，已尝试回滚：'+$reason)
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
        default { throw ('不支持的操作：'+$action) }
    }
    Write-Result -Ok $true -Message 'Windows 操作完成。' -Data $data
    exit 0
} catch {
    try { Write-Result -Ok $false -Message $_.Exception.Message -Data $null } catch { }
    exit 1
}
