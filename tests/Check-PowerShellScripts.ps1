#requires -version 5.1
<#
SwitchLAN Studio - verify PowerShell 5.1 script encoding and parser syntax.
Read-only: parses source files and prints results. Does not execute backend scripts.
#>
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$sourceDirs = @('backend', 'backend\Stage2', 'tools', 'tests')
$scriptFiles = @($sourceDirs | ForEach-Object {
    Get-ChildItem -LiteralPath (Join-Path $root $_) -File -Filter '*.ps1'
})
if ($scriptFiles.Count -eq 0) { throw 'PowerShell source file not found.' }
$failed = $false
foreach ($file in $scriptFiles) {
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191)
    if (-not $hasBom) {
        Write-Host ('[Error] Missing UTF-8 BOM:' + $file.Name) -ForegroundColor Red
        $failed = $true
    }
    try {
        $decoder = New-Object System.Text.UTF8Encoding -ArgumentList @($false, $true)
        $offset = if ($hasBom) { 3 } else { 0 }
        [void]$decoder.GetString($bytes, $offset, ($bytes.Length - $offset))
    } catch {
        Write-Host ('[Error] Invalid UTF-8 byte:' + $file.Name) -ForegroundColor Red
        $failed = $true
    }
    $crlf = 0
    $bareLf = 0
    for ($i = 0; $i -lt $bytes.Length; $i++) {
        if ($bytes[$i] -eq 10) {
            if ($i -gt 0 -and $bytes[$i - 1] -eq 13) { $crlf++ } else { $bareLf++ }
        }
    }
    if ($bareLf -gt 0 -or $crlf -eq 0) {
        Write-Host ('[ERROR] CRLF line endings required (CRLF= detected' + $crlf + ', naked LF=' + $bareLf + '）：' + $file.Name) -ForegroundColor Red
        $failed = $true
    }
    $tokens = $null
    $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors)
    if (@($parseErrors).Count -gt 0) {
        $failed = $true
        Write-Host ('[Error] PowerShell syntax error:' + $file.Name) -ForegroundColor Red
        foreach ($parseError in $parseErrors) {
            Write-Host ('  ' + $parseError.Extent.StartLineNumber + ' Line:' + $parseError.Message) -ForegroundColor Red
        }
    } elseif ($hasBom) {
        Write-Host ('[Passed] UTF-8 BOM + syntax parsing:' + $file.Name) -ForegroundColor Green
    }
}
if ($failed) { throw 'PowerShell static check failed. Please send the output to the developer.' }
Write-Host 'Check completed: script encoding and parsing passed. NOTE: This does not equate to running the feature on a real Windows system.' -ForegroundColor Green
