#requires -version 5.1
<#
SwitchLAN Studio Stage 2A - isolated local test account + SMB share.

Safety scope:
- Account is always pclshare_test.
- Share is always SwitchLAN-Test.
- Directory is always E:\LANShare\SwitchLAN-Test.
- The script refuses to touch an existing account/share/directory unless the
  SwitchLAN test marker is present.
- Cleanup Is explicit and verifies the marker before deleting anything.
- Password is never written to disk in plaintext by this script.

This is a test harness, not the final general-purpose write backend.
#>
[CmdletBinding()]
param(
    [ValidateSet('Setup','Cleanup')]
    [string]$Action = 'Setup',
    [string]$PasswordFile,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$AccountName = 'pclshare_test'
$ShareName = 'SwitchLAN-Test'
$TestDirectory = 'E:\LANShare\SwitchLAN-Test'
$MarkerName = '.switchlan-stage2-test.json'
$expectedDirectory = [IO.Path]::GetFullPath($TestDirectory)
$computer = $env:COMPUTERNAME
$resultBase = Join-Path $env:TEMP ('SwitchLAN-Stage2Test-' + $Action)
$resultPath = $resultBase + '.json'

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Result {
    param(
        [bool]$Success,
        [System.Collections.IDictionary]$Checks,
        [string]$Message
    )

    $result = [ordered]@{
        tool          = 'SwitchLAN-Stage2Test'
        version       = 1
        action        = $Action
        success       = $Success
        account       = $AccountName
        share         = $ShareName
        path          = $expectedDirectory
        message       = $Message
        checks        = $Checks
        generatedAt   = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')
    }
    $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resultPath -Encoding UTF8
    Write-Host ('结果文件：' + $resultPath)
}

function New-DirectoryAcl {
    param([string]$Path, [string]$AccountSid)

    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRuleProtection($true, $false)
    $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
                   [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    $propagation = [System.Security.AccessControl.PropagationFlags]::None
    $allow = [System.Security.AccessControl.AccessControlType]::Allow

    $systemSid = New-Object -TypeName System.Security.Principal.SecurityIdentifier -ArgumentList 'S-1-5-18'
    $adminsSid = New-Object -TypeName System.Security.Principal.SecurityIdentifier -ArgumentList 'S-1-5-32-544'
    $userSid = New-Object -TypeName System.Security.Principal.SecurityIdentifier -ArgumentList $AccountSid

    foreach ($entry in @(
        @{ Sid = $systemSid; Rights = [System.Security.AccessControl.FileSystemRights]::FullControl },
        @{ Sid = $adminsSid; Rights = [System.Security.AccessControl.FileSystemRights]::FullControl },
        @{ Sid = $userSid;  Rights = [System.Security.AccessControl.FileSystemRights]::Modify }
    )) {
        $rule = New-Object -TypeName System.Security.AccessControl.FileSystemAccessRule -ArgumentList @(
            $entry.Sid,
            $entry.Rights,
            $inheritance,
            $propagation,
            $allow)
        [void]$acl.AddAccessRule($rule)
    }

    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Remove-TestResources {
    param([string]$MarkerPath)

    $share = Get-SmbShare -Name $ShareName -ErrorAction SilentlyContinue
    if ($share) {
        Remove-SmbShare -Name $ShareName -Force -ErrorAction Stop
        Write-Host ('已删除共享：' + $ShareName)
    }

    $user = Get-LocalUser -Name $AccountName -ErrorAction SilentlyContinue
    if ($user) {
        Remove-LocalUser -Name $AccountName -ErrorAction Stop
        Write-Host ('已删除测试账户：' + $AccountName)
    }

    if (Test-Path -LiteralPath $MarkerPath -PathType Leaf) {
        Remove-Item -LiteralPath $MarkerPath -Force -ErrorAction Stop
    }
    if (Test-Path -LiteralPath $expectedDirectory -PathType Container) {
        $remaining = @(Get-ChildItem -LiteralPath $expectedDirectory -Force -ErrorAction Stop)
        if ($remaining.Count -ne 0) {
            throw ('测试目录中仍有文件，拒绝递归删除：' + $expectedDirectory)
        }
        Remove-Item -LiteralPath $expectedDirectory -Force -ErrorAction Stop
        Write-Host ('已删除测试目录：' + $expectedDirectory)
    }
}

if ($DryRun) {
    Write-Host 'DRY RUN：不会创建账户、目录或共享。'
    Write-Host ('账户：' + $computer + '\' + $AccountName)
    Write-Host ('共享：' + $ShareName)
    Write-Host ('目录：' + $expectedDirectory)
    Write-Host ('动作：' + $Action)
    return
}

if (-not (Test-IsAdministrator)) {
    throw '此脚本需要管理员权限。请从“以管理员身份运行”的 Windows PowerShell 5.1 中执行。'
}

$markerPath = Join-Path $expectedDirectory $MarkerName
$checks = @{}
$createdUser = $false
$createdDirectory = $false
$createdShare = $false

if ($Action -eq 'Setup') {
    if (Get-LocalUser -Name $AccountName -ErrorAction SilentlyContinue) {
        throw ('账户已存在，拒绝覆盖：' + $AccountName)
    }
    if (Get-SmbShare -Name $ShareName -ErrorAction SilentlyContinue) {
        throw ('共享已存在，拒绝覆盖：' + $ShareName)
    }
    if (Test-Path -LiteralPath $expectedDirectory) {
        throw ('测试目录已存在，拒绝覆盖：' + $expectedDirectory)
    }

    if (-not $PasswordFile) {
        $securePassword = Read-Host '请输入测试账户密码' -AsSecureString
    } else {
        if (-not (Test-Path -LiteralPath $PasswordFile -PathType Leaf)) {
            throw ('密码文件不存在：' + $PasswordFile)
        }
        $encrypted = Get-Content -LiteralPath $PasswordFile -Raw
        Remove-Item -LiteralPath $PasswordFile -Force -ErrorAction SilentlyContinue
        $securePassword = ConvertTo-SecureString $encrypted
    }

    try {
        New-LocalUser -Name $AccountName -Password $securePassword `
            -AccountNeverExpires -PasswordNeverExpires `
            -Description 'SwitchLAN Stage2A test account' `
            -ErrorAction Stop | Out-Null
        $createdUser = $true
        Write-Host ('已创建测试账户：' + $computer + '\' + $AccountName)

        $parent = Split-Path -Parent $expectedDirectory
        if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
            New-Item -ItemType Directory -Path $parent -Force -ErrorAction Stop | Out-Null
        }
        New-Item -ItemType Directory -Path $expectedDirectory -ErrorAction Stop | Out-Null
        $createdDirectory = $true
        Write-Host ('已创建测试目录：' + $expectedDirectory)

        $user = Get-LocalUser -Name $AccountName -ErrorAction Stop
        New-DirectoryAcl -Path $expectedDirectory -AccountSid $user.SID.Value
        Write-Host '已设置 NTFS：仅 SYSTEM/Administrators 完全控制，测试账户修改。'

        $marker = [ordered]@{
            tool      = 'SwitchLAN-Stage2Test'
            version   = 1
            account   = $AccountName
            share     = $ShareName
            path      = $expectedDirectory
            createdAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')
        }
        $marker | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding UTF8

        New-SmbShare -Name $ShareName -Path $expectedDirectory `
            -ChangeAccess ($computer + '\' + $AccountName) `
            -Description 'SwitchLAN Stage 2A test share - safe to delete' `
            -ErrorAction Stop | Out-Null
        $createdShare = $true
        Write-Host ('已创建 SMB 共享：' + $ShareName)

        $share = Get-SmbShare -Name $ShareName -ErrorAction Stop
        $shareAccess = @(Get-SmbShareAccess -Name $ShareName -ErrorAction Stop)
        $acl = Get-Acl -LiteralPath $expectedDirectory
        $userSidValue = (Get-LocalUser -Name $AccountName -ErrorAction Stop).SID.Value
        $testRule = @($acl.Access | Where-Object {
            $_.IdentityReference.Value -eq $userSidValue -or
            $_.IdentityReference.Value -eq ($computer + '\' + $AccountName)
        })
        $everyoneRule = @($acl.Access | Where-Object {
            $_.IdentityReference.Value -match '(^|\\)Everyone$'
        })

        $checks = [ordered]@{
            accountExists      = [bool](Get-LocalUser -Name $AccountName -ErrorAction SilentlyContinue)
            accountEnabled     = [bool]((Get-LocalUser -Name $AccountName -ErrorAction Stop).Enabled)
            shareExists        = [bool]$share
            sharePathMatches   = ([string]$share.Path -eq $expectedDirectory)
            shareAccountRule   = @($shareAccess | Where-Object { $_.AccountName -eq ($computer + '\' + $AccountName) }).Count -gt 0
            ntfsTestAccountRule = $testRule.Count -gt 0
            ntfsEveryoneAbsent = $everyoneRule.Count -eq 0
            markerPresent      = (Test-Path -LiteralPath $markerPath -PathType Leaf)
        }

        $allOk = @($checks.Values | Where-Object { -not $_ }).Count -eq 0
        Write-Result -Success $allOk -Checks $checks -Message $(if ($allOk) { '测试账户、目录、ACL 和共享已创建并通过只读核验。' } else { '部分核验未通过。' })
        if (-not $allOk) { throw '创建完成，但只读核验未全部通过。' }
        Write-Host 'SETUP_OK'
    } catch {
        $failure = $_
        Write-Host ('SETUP_FAILED：' + $failure.Exception.Message) -ForegroundColor Red
        try {
            if ($createdShare) { Remove-SmbShare -Name $ShareName -Force -ErrorAction SilentlyContinue }
            if ($createdUser) { Remove-LocalUser -Name $AccountName -ErrorAction SilentlyContinue }
            if ($createdDirectory -and (Test-Path -LiteralPath $markerPath)) {
                Remove-TestResources -MarkerPath $markerPath
            } elseif ($createdDirectory -and (Test-Path -LiteralPath $expectedDirectory)) {
                # The marker may not exist if creation failed before it was written.
                $remaining = @(Get-ChildItem -LiteralPath $expectedDirectory -Force -ErrorAction SilentlyContinue)
                if ($remaining.Count -eq 0) { Remove-Item -LiteralPath $expectedDirectory -Force -ErrorAction SilentlyContinue }
            }
        } catch {
            Write-Host ('回滚时又发生错误：' + $_.Exception.Message) -ForegroundColor Yellow
        }
        Write-Result -Success $false -Checks $checks -Message $failure.Exception.Message
        throw
    }
}

if ($Action -eq 'Cleanup') {
    if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
        throw ('找不到测试标记，拒绝删除：' + $markerPath)
    }
    $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
    if ($marker.tool -ne 'SwitchLAN-Stage2Test' -or
        $marker.account -ne $AccountName -or
        $marker.share -ne $ShareName -or
        [string]$marker.path -ne $expectedDirectory) {
        throw '测试标记内容不匹配，拒绝删除。'
    }

    Remove-TestResources -MarkerPath $markerPath
    $checks = [ordered]@{
        accountAbsent = -not [bool](Get-LocalUser -Name $AccountName -ErrorAction SilentlyContinue)
        shareAbsent   = -not [bool](Get-SmbShare -Name $ShareName -ErrorAction SilentlyContinue)
        directoryAbsent = -not (Test-Path -LiteralPath $expectedDirectory)
    }
    $allOk = @($checks.Values | Where-Object { -not $_ }).Count -eq 0
    Write-Result -Success $allOk -Checks $checks -Message '测试账户、共享和目录已清理。'
    if (-not $allOk) { throw '清理后仍有残留。' }
    Write-Host 'CLEANUP_OK'
}
