# Security boundaries

This document describes the intended safeguards, not a guarantee that every Windows configuration has been validated.

## Local management

The WebView2 interface communicates through fixed message types and cannot choose arbitrary PowerShell script paths. Write operations use a one-shot UAC helper. The helper rechecks the target account SID, object identity and current state before making changes.

Built-in accounts, members of the local Administrators group and the account running the management process are protected. The application cannot reveal an existing account password. Password resets replace the old password and can affect saved SMB credentials.

Deleting a standard account keeps files, the user profile folder and NTFS ACLs. Old SID entries can remain. Account deletion is not permission cleanup. Accounts referenced by managed shares or direct SMB permissions must be handled before deletion.

## SMB and NTFS

New shares require an existing local folder and a protected standard account. Disk roots, sensitive system paths and paths containing junctions or symbolic links are rejected. New managed shares add the required NTFS allow entries for the chosen account.

Editing share permissions changes only the selected account’s direct SMB entry. It does not replace Everyone, group, Deny or NTFS entries. The permission analysis view does not calculate final effective access.

Stopping an existing Windows share keeps NTFS permissions unchanged. Stopping a SwitchLAN-managed share attempts to remove NTFS permissions originally added by SwitchLAN; cleanup can fail and require manual review. Neither action deletes the local folder or files. Disconnecting a share can interrupt active transfers.

## Network tools

Use discovery only on networks you own or are authorized to scan. Automatic discovery is bounded to the selected private IPv4 /24 subnet. Manual probes support routable private IPv4 targets. The application does not guess passwords, open the firewall automatically or expose port 445 to the internet.

A TCP connection, an enumerated share name and successful folder listing are separate observations. A timeout is not proof that a device is offline or that access was denied. Folder listing does not verify file-content reads, writes or deletion.

## Reports and vulnerability reporting

Reports, logs and screenshots can expose hostnames, account names, SIDs, IP addresses and paths. Redact them before sharing. Temporary elevated requests and results may contain credentials while an operation is running.

For a security issue, use GitHub private vulnerability reporting if the repository offers it. Otherwise contact the maintainer privately through a channel listed on their profile. Do not post credentials, live machine reports or exploit details in a public issue.

Use dedicated test accounts and empty test folders for integration testing. Do not run the opt-in elevated integration script on a production machine.
