# Contributing

Small, focused pull requests are welcome. Describe the observable problem, the change and the checks you ran.

## Development

Install the .NET 8 SDK, WebView2 Runtime, Node.js and Python. Build from the repository root using the commands in README.md. The `global.json` file selects a stable .NET 8 SDK.

Run the read-only checks listed in README.md before submitting a change. Browser tests use synthetic data; install their dependencies from `tests/requirements.txt`. Screenshots from those tests must remain clearly marked `MOCK`.

## Management changes

Keep message types, backend actions and payload fields stable unless the entire bridge is updated together. Preserve SID checks, protected-account guards, stale-state checks, deletion confirmations, NTFS-preservation requirements and post-operation verification.

PowerShell 5.1 files must be UTF-8 with BOM and CRLF. Keep temporary passwords out of logs and the managed-object registry. Do not weaken Windows password policy or firewall settings to make a test pass.

For UAC, SMB or NTFS changes, explain the dedicated test environment used and include redacted before/after evidence. Do not run elevated integration tests automatically in normal CI.

## English text

Use standard Windows terms: account, share, network adapter, direct allow entry, inherited entry and effective access. Translate only application text. Never translate actual usernames, share names, paths, protocol keys or managed-object ownership markers.

## Bug reports

Include Windows version, app version, reproduction steps, expected behavior and redacted errors. Do not upload unredacted snapshots, diagnostic reports or passwords.
