#requires -version 5.1
<# Read-only local listening TCP socket inventory. No user arguments become executable commands.
   Do not mistake a missing process name for a closed listener or label javaw as Minecraft. #>
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$OutputPath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$warnings = @()
$readable = $false
$items = @()
$truncated = $false
try {
    $connections = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Sort-Object LocalPort, OwningProcess)
    $truncated = $connections.Count -gt 250
    $items = @(foreach ($conn in ($connections | Select-Object -First 250)) {
        $pidValue = [int]$conn.OwningProcess
        $processName = ''
        try {
            if ($pidValue -eq 4) { $processName = 'System' }
            elseif ($pidValue -gt 0) { $processName = [string](Get-Process -Id $pidValue -ErrorAction Stop).ProcessName }
        } catch { $processName = '' }
        $lower = $processName.ToLowerInvariant()
        $systemNames = @('system','svchost','lsass','services','wininit','winlogon','spoolsv','smss','csrss','dns','smbserver')
        $gameNames = @('bedrock_server','terrariaserver','factorio','valheim_server')
        $category = 'application-unknown'
        if ($pidValue -eq 4 -or $systemNames -contains $lower) { $category = 'windows-system' }
        elseif ($gameNames -contains $lower) { $category = 'game-candidate' }
        # Do not label javaw or java as Minecraft: those processes host many applications.
        @{
            ip = [string]$conn.LocalAddress
            port = [int]$conn.LocalPort
            pid = $pidValue
            process = $processName
            category = $category
        }
    })
    $readable = $true
} catch {
    $warnings += 'Unable to read the local TCP listening list, it may be that the system command is unavailable or the current identity has insufficient permissions.'
}
$payload = @{
    kind = 'switchlan-local-tcp-listeners'
    schemaVersion = 1
    capturedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')
    readable = [bool]$readable
    truncated = [bool]$truncated
    listeners = @($items)
    warnings = @($warnings)
}
$full = [System.IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath))
$parent = Split-Path -Parent $full
if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'The output directory does not exist.' }
$json = ConvertTo-Json -InputObject $payload -Depth 7
[System.IO.File]::WriteAllText($full, $json, (New-Object System.Text.UTF8Encoding($true)))
