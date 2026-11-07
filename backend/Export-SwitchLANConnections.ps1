#requires -version 5.1
<# On-demand, read-only inventory of local SMB server sessions and open files.
   May require administrator rights. Failure must never be displayed as zero connections.
   This JSON may contain sensitive usernames and file paths; store locally only. #>
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$OutputPath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$warnings = New-Object System.Collections.Generic.List[string]
$sessionReadable = $false
$filesReadable = $false
$sessionItems = @()
$fileItems = @()
$sessionTruncated = $false
$filesTruncated = $false
try {
    $rawSessions = @(Get-SmbSession -ErrorAction Stop)
    $sessionTruncated = $rawSessions.Count -gt 200
    $sessionItems = @($rawSessions | Select-Object -First 200 | ForEach-Object {
        @{
            sessionId = [string]$_.SessionId
            client = [string]$_.ClientComputerName
            username = [string]$_.ClientUserName
            numOpens = [int]$_.NumOpens
            dialect = [string]$_.Dialect
            secondsExists = [long]$_.SecondsExists
            secondsIdle = [long]$_.SecondsIdle
        }
    })
    $sessionReadable = $true
} catch {
    $warnings.Add('当前身份无法读取 SMB 会话，可能需要管理员权限或 SMB 服务器服务未就绪。')
}
try {
    $rawFiles = @(Get-SmbOpenFile -ErrorAction Stop)
    $filesTruncated = $rawFiles.Count -gt 200
    $fileItems = @($rawFiles | Select-Object -First 200 | ForEach-Object {
        @{
            fileId = [string]$_.FileId
            sessionId = [string]$_.SessionId
            client = [string]$_.ClientComputerName
            username = [string]$_.ClientUserName
            shareRelativePath = [string]$_.ShareRelativePath
            path = [string]$_.Path
        }
    })
    $filesReadable = $true
} catch {
    $warnings.Add('当前身份无法读取 SMB 打开文件列表；不能因此断言没有文件被访问。')
}
$payload = @{
    kind = 'switchlan-local-smb-connections'
    schemaVersion = 1
    capturedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')
    sessionsReadable = [bool]$sessionReadable
    filesReadable = [bool]$filesReadable
    sessionsTruncated = [bool]$sessionTruncated
    filesTruncated = [bool]$filesTruncated
    sessions = @($sessionItems)
    files = @($fileItems)
    warnings = @($warnings.ToArray())
}
$full = [System.IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath))
$parent = Split-Path -Parent $full
if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw '输出文件夹不存在。' }
$json = ConvertTo-Json -InputObject $payload -Depth 7
[System.IO.File]::WriteAllText($full, $json, (New-Object System.Text.UTF8Encoding($true)))
