#requires -version 5.1
<#
SwitchLAN Studio read-only startup & source-check report.
Does not launch elevated actions or modify Windows users/shares/ACL/firewall.
Generated report may contain local paths; inspect before sharing.
#>
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$reportPath = Join-Path $env:TEMP 'SwitchLAN-Check.txt'
$lines = New-Object 'System.Collections.Generic.List[string]'
function Add-Line { param([string]$Line) $script:lines.Add($Line); Write-Host $Line }
function Check-File { param([string]$Name,[string]$Path)
    $present = [IO.File]::Exists($Path)
    Add-Line ($Name + ': ' + $(if ($present) { 'OK' } else { 'MISSING' }))
}
Add-Line ('SwitchLAN read-only check ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Add-Line ('ProjectRoot: ' + $root)
Check-File 'Launcher' (Join-Path $root 'Start-SwitchLAN.cmd')
Check-File 'Web UI' (Join-Path $root 'index.html')
Check-File 'Desktop project' (Join-Path $root 'desktop\SwitchLAN.Desktop\SwitchLAN.Desktop.csproj')
Check-File 'Desktop DLL (Debug)' (Join-Path $root 'desktop\SwitchLAN.Desktop\bin\Debug\net8.0-windows\SwitchLAN.Desktop.dll')
Check-File 'Desktop DLL (Release)' (Join-Path $root 'desktop\SwitchLAN.Desktop\bin\Release\net8.0-windows\SwitchLAN.Desktop.dll')
Check-File 'Bundled web UI (Debug)' (Join-Path $root 'desktop\SwitchLAN.Desktop\bin\Debug\net8.0-windows\web\index.html')
Check-File 'Elevated helper' (Join-Path $root 'backend\Stage2\Invoke-SwitchLANManage.ps1')
try {
    $exe = Get-Command dotnet.exe -ErrorAction Stop
    Add-Line ('dotnet.exe: ' + $exe.Source)
    $runtimes = @(& $exe.Source --list-runtimes 2>&1 | ForEach-Object { [string]$_ })
    foreach ($line in $runtimes) { Add-Line ('  ' + $line) }
    if (@($runtimes | Where-Object { $_ -match '^Microsoft.WindowsDesktop.App 8\.' }).Count -eq 0) {
        Add-Line 'WARNING: Microsoft.WindowsDesktop.App 8.x is not listed.'
    }
} catch { Add-Line ('ERROR: dotnet unavailable: ' + $_.Exception.Message) }
Add-Line ('PSVersion: ' + $PSVersionTable.PSVersion)
$scripts = @(Get-ChildItem -LiteralPath (Join-Path $root 'backend') -Recurse -Filter '*.ps1' -File -ErrorAction SilentlyContinue)
foreach ($f in $scripts) {
    $bytes = [IO.File]::ReadAllBytes($f.FullName)
    $bom = $bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191
    $tokens = $null; $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($f.FullName,[ref]$tokens,[ref]$errors)
    Add-Line ('Script: ' + $f.Name + ' BOM=' + $bom + ' ParserErrors=' + @($errors).Count)
    foreach ($errorItem in @($errors)) { Add-Line ('  Line ' + $errorItem.Extent.StartLineNumber + ': ' + $errorItem.Message) }
}
$runtimeReg = @(
  'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F1D7CC6A-C0AA-4A4C-A798-7B6A87BBDF8F}',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F1D7CC6A-C0AA-4A4C-A798-7B6A87BBDF8F}'
)
$webview = @($runtimeReg | Where-Object { Test-Path -LiteralPath $_ })
Add-Line ('WebView2 registry candidate(s) found: ' + $webview.Count + ' (0 is inconclusive)')
$logPath = Join-Path $env:TEMP 'SwitchLAN.Desktop.log'
if (Test-Path -LiteralPath $logPath) {
    Add-Line 'Desktop log (last 60 lines):'
    try { @(Get-Content -LiteralPath $logPath -Tail 60 -ErrorAction Stop) | ForEach-Object { Add-Line ('  ' + $_) } }
    catch { Add-Line ('Could not read desktop log: ' + $_.Exception.Message) }
} else { Add-Line 'Desktop log: no file; application may not have started' }
try { [IO.File]::WriteAllLines($reportPath,[string[]]$lines,(New-Object Text.UTF8Encoding($true))) }
catch { Add-Line ('Unable to save report: ' + $_.Exception.Message) }
Add-Line ('Report saved: ' + $reportPath)
Add-Line 'IMPORTANT: Please redact usernames, paths and machine names before sharing.'
