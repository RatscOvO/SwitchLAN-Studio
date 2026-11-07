# Elevated Windows management

`Invoke-SwitchLANManage.ps1` is a one-shot helper called by the desktop host for fixed account and SMB management actions. Despite the historical directory name, it includes later Core functionality. Read the root README and SECURITY.md for current behavior.

It requires administrator privileges and verifies that the UAC identity matches the desktop caller SID. Requests and results use temporary JSON files. The host removes them after reading the result. Ownership markers and the managed registry remain language-independent.

`Invoke-SwitchLANStage2Test.ps1` is an opt-in integration test that creates and removes dedicated Windows test objects. It is not part of normal startup or CI. Run it only in an isolated Windows test environment after reviewing the script.
