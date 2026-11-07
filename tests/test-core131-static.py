"""Static safety/encoding contract (not PowerShell parsing or Windows runtime validation)."""
from pathlib import Path
r=Path(__file__).resolve().parents[1]
ps=(r/'backend/Stage2/Invoke-SwitchLANManage.ps1').read_bytes()
assert ps[:3]==b'\xef\xbb\xbf','PowerShell 5.1 needs BOM for Chinese literals'
assert b'\r\n' in ps and b'\n' not in ps.replace(b'\r\n',b''),'CRLF expected'
s=ps.decode('utf-8-sig')
start=s.index("        'delete-existing-user' {")
end=s.index("        'unshare-existing' {",start)
section=s[start:end]
assert 'preserveNtfs' in section
assert 'Remove-LocalUser' in section
assert 'Set-Acl' not in section and 'Remove-DirectAceOnShareRoots' not in section
assert 'ntfsUnchanged=$true' in section
cs=(r/'desktop/SwitchLAN.Desktop/MainForm.cs').read_text('utf-8')
assert 'TryGetProperty("preserveNtfs", out var preserveNtfs)' in cs
scanner=(r/'desktop/SwitchLAN.Desktop/LanScanner.cs').read_text('utf-8')
for marker in ('MaxPendingReadChecks = 4','"unknown"','"denied"','"readable"','errorCode'):
    assert marker in scanner,marker
print('PASS: PS BOM+CRLF, no implicit NTFS cleanup on delete, desktop fail-closed guard, LAN tri-state contract')
