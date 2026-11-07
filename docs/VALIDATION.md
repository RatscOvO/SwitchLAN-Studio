# Validation — English 1.4.5 Beta

Checked on Windows on 2026-11-07:

- .NET 8.0.427 Release build: passed, zero errors. One pre-existing MSB3277 WindowsBase/WebView2 WPF reference warning remains.
- 20 JavaScript policy tests: passed.
- Core 1.3.1 and Core 1.4 static contracts: passed.
- Windows PowerShell 5.1 parser and UTF-8 BOM/CRLF checks: passed for all nine source scripts.
- Existing UX, permission evidence, game discovery and radar browser regressions: passed with synthetic data, including narrow viewports.
- English regression: all eight navigation pages and accessible labels checked; account creation/edit/reset/deletion, share creation/permission/unshare requests checked against an in-memory bridge. Incorrect deletion confirmation was blocked; NTFS-preservation payload was retained.

Screenshots marked MOCK contain synthetic data. No real local accounts or shares were changed by these checks.

Not validated: real UAC writes, password-policy outcomes, NTFS cleanup, real remote SMB access, two-PC discovery, Windows DPI behavior, or performance across graphics drivers. System-originated messages and actual object names retain their original language.
