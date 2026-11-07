"""Core 1.4 non-Windows structural guards; NOT a PowerShell/C# compilation test."""
from pathlib import Path
r=Path(__file__).resolve().parents[1]
script=(r/'backend/Export-SwitchLANConnections.ps1').read_bytes()
assert script[:3]==b'\xef\xbb\xbf', 'PowerShell 5.1 script requires BOM'
assert b'\r\n' in script and b'\n' not in script.replace(b'\r\n',b''), 'PowerShell 5.1 script needs CRLF'
s=script.decode('utf-8-sig')
for cmd in ('Get-SmbSession','Get-SmbOpenFile','-ErrorAction Stop'):
    assert cmd in s
for dangerous in ('Close-SmbSession','Close-SmbOpenFile','Remove-SmbShare','Grant-SmbShareAccess','Set-SmbShare','Remove-LocalUser'):
    assert dangerous not in s
csharp=(r/'desktop/SwitchLAN.Desktop/MainForm.cs').read_text('utf-8')
runner=(r/'desktop/SwitchLAN.Desktop/BackendRunner.cs').read_text('utf-8')
frontend=(r/'js/app.js').read_text('utf-8')
assert 'case "connections-refresh":' in csharp
assert 'ExportConnectionsAsync()' in csharp
assert 'Export-SwitchLANConnections.ps1' in runner
assert 'finally' in csharp[csharp.index('private async Task ConnectionsRefreshAsync()'):csharp.index('private async Task AdminRefreshAsync()')]
for token in ('permissionsAnalysisPage','connectionsPage','lanMap(','lan-map-focus','lan-view-map'):
    assert token in frontend
assert 'state.connections=null;' in frontend
print('PASS: new read-only SMB collector BOM/CRLF, fixed Windows bridge and three UI entries')
