using System.Diagnostics;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SwitchLAN.Desktop;

public sealed class MainForm : Form
{
    private const string VirtualHost = "switchlan.local";
    private readonly WebView2 _webView = new();
    private readonly BackendRunner _backend = new();
    private bool _busy;
    private CancellationTokenSource? _lanCancellation;
    private CancellationTokenSource? _gameCancellation;
    private CancellationTokenSource? _radarCancellation;
    private int _radarRunId;
    private string _lastSnapshotFailure = string.Empty;

    public MainForm()
    {
        Text = "SwitchLAN Studio · Core 1.4.5 · English";
        ClientSize = new Size(1280, 860);
        MinimumSize = new Size(980, 680);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(10, 14, 22);

        _webView.Dock = DockStyle.Fill;
        Controls.Add(_webView);
        Load += MainForm_Load;
        FormClosing += (_, _) => {
            try { _radarCancellation?.Cancel(); } catch (ObjectDisposedException) { }
            _lanCancellation?.Cancel(); _gameCancellation?.Cancel(); _webView.Dispose();
        };
    }

    private async void MainForm_Load(object? sender, EventArgs e)
    {
        try
        {
            DesktopLog.Write("MainForm loaded; initializing WebView2.");
            await InitializeWebViewAsync();
            DesktopLog.Write("WebView2 navigation started.");
        }
        catch (Exception ex)
        {
            DesktopLog.Write("WebView2 startup failure: " + ex);
            MessageBox.Show(
                this,
                "Unable to start built-in interface.\r\n\r\n" + ex.Message +
                "\r\n\r\nPlease confirm that the Microsoft Edge WebView2 Runtime is installed and that the web/ and backend/ directories are included in the project build output.",
                "SwitchLAN Studio",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
    }

    private async Task InitializeWebViewAsync()
    {
        var indexPath = Path.Combine(_backend.WebRoot, "index.html");
        if (!File.Exists(indexPath))
        {
            throw new FileNotFoundException("The built-in web page file cannot be found.", indexPath);
        }

        var userDataFolder = Path.Combine(_backend.DataRoot, "WebView2");
        Directory.CreateDirectory(userDataFolder);
        DesktopLog.Write("WebView2 user data folder ready.");

        var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
        DesktopLog.Write("WebView2 environment created.");
        await _webView.EnsureCoreWebView2Async(environment);
        DesktopLog.Write("WebView2 core initialized.");

        var core = _webView.CoreWebView2;
        core.Settings.AreDevToolsEnabled = string.Equals(
            Environment.GetEnvironmentVariable("SWITCHLAN_DEV"), "1",
            StringComparison.OrdinalIgnoreCase);
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsZoomControlEnabled = true;

        core.SetVirtualHostNameToFolderMapping(
            VirtualHost,
            _backend.WebRoot,
            CoreWebView2HostResourceAccessKind.Allow);

        core.NavigationStarting += Core_NavigationStarting;
        core.NavigationCompleted += (_, args) =>
        {
            DesktopLog.Write("WebView2 navigation completed: success=" + args.IsSuccess +
                             "; error=" + args.WebErrorStatus);
            if (!args.IsSuccess)
            {
                MessageBox.Show(this,
                    "The SwitchLAN interface did not load successfully. Please run Check-SwitchLAN.cmd to view navigation errors.\r\n" +
                    "WebView2: " + args.WebErrorStatus,
                    "SwitchLAN interface loading error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        };
        core.DOMContentLoaded += (_, _) => DesktopLog.Write("WebView2 DOM content loaded.");
        core.ProcessFailed += (_, args) => DesktopLog.Write("WebView2 process failed: " + args.ProcessFailedKind);

        core.NewWindowRequested += Core_NewWindowRequested;
        core.WebMessageReceived += Core_WebMessageReceived;
        core.DocumentTitleChanged += (_, _) =>
        {
            var title = core.DocumentTitle;
            if (!string.IsNullOrWhiteSpace(title))
            {
                Text = title + " · SwitchLAN Desktop";
            }
        };

        core.Navigate($"https://{VirtualHost}/index.html");
        DesktopLog.Write("Navigate called: https://" + VirtualHost + "/index.html");
    }

    private void Core_NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (e.Uri.Equals($"https://{VirtualHost}", StringComparison.OrdinalIgnoreCase) ||
            e.Uri.StartsWith($"https://{VirtualHost}/", StringComparison.OrdinalIgnoreCase) ||
            e.Uri.Equals("about:blank", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        e.Cancel = true;
    }

    private void Core_NewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
    }

    private async void Core_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string? type;
        JsonElement message;
        try
        {
            using var document = JsonDocument.Parse(e.WebMessageAsJson);
            message = document.RootElement.Clone();
            if (message.ValueKind != JsonValueKind.Object ||
                !message.TryGetProperty("type", out var typeElement) ||
                typeElement.ValueKind != JsonValueKind.String)
            {
                PostError("Unrecognized desktop message.");
                return;
            }

            type = typeElement.GetString();
        }
        catch (JsonException)
        {
            PostError("Desktop message is not valid JSON.");
            return;
        }

        // Never accept privileged requests from embedded or navigated external pages.
        if (!e.Source.StartsWith("https://" + VirtualHost + "/", StringComparison.OrdinalIgnoreCase))
        {
            DesktopLog.Write("Rejected a WebView message from a non-local source.");
            return;
        }
        // Log message TYPE only: requests may contain account passwords.
        DesktopLog.Write("WebView2 message received: " + (type ?? "(missing)"));
        if (string.Equals(type, "ui-ready", StringComparison.Ordinal))
        {
            DesktopLog.Write("JavaScript bootstrap reached the desktop bridge.");
            return;
        }
        if (string.Equals(type, "ui-error", StringComparison.Ordinal))
        {
            var summary = message.TryGetProperty("message", out var jsMessage) &&
                          jsMessage.ValueKind == JsonValueKind.String
                ? jsMessage.GetString() ?? "unknown"
                : "unknown";
            DesktopLog.Write("JavaScript error (summary): " + Trim(summary));
            return;
        }
        if (string.Equals(type, "open-diagnostics", StringComparison.Ordinal))
        {
            OpenDiagnostics();
            return;
        }

        if (string.Equals(type, "radar-stop", StringComparison.Ordinal))
        {
            StopRadar();
            return;
        }
        if (string.Equals(type, "radar-start", StringComparison.Ordinal))
        {
            try
            {
                var localIp = RequireString(message, "localIp");
                var interval = ReadBoundedInt(message, "intervalMs", 2000, 1000, 10000);
                if (!message.TryGetProperty("targets", out var list) || list.ValueKind != JsonValueKind.Array ||
                    list.GetArrayLength() > 8)
                    throw new InvalidOperationException("The monitoring target is illegal, the maximum number is 8.");
                var targets = new List<NetworkRadar.Target>();
                foreach (var item in list.EnumerateArray())
                {
                    var id = RequireString(item, "id");
                    var ip = RequireString(item, "ip");
                    var port = ReadBoundedInt(item, "port", 0, 0, 65535);
                    var name = RequireString(item, "name");
                    if (id.Length > 48 || name.Length > 60) throw new InvalidOperationException("Target name is too long.");
                    NetworkRadar.RequireUnicastIPv4(ip);
                    targets.Add(new NetworkRadar.Target(id, name, ip, port));
                }
                if (targets.Select(t => t.id).Distinct().Count() != targets.Count)
                    throw new InvalidOperationException("Duplicate monitoring target ID.");
                NetworkRadar.RequireUnicastIPv4(localIp);
                StopRadar();
                var cts = new CancellationTokenSource();
                _radarCancellation = cts;
                var runId = _radarRunId;
                Post(new { type = "radar-state", running = true, runId });
                _ = RunRadarAsync(targets, localIp, interval, runId, cts);
            }
            catch (Exception ex)
            {
                Post(new { type = "radar-state", running = false, error = ex.Message });
            }
            return;
        }
        if (string.Equals(type, "radar-listeners", StringComparison.Ordinal))
        {
            if (_busy) { Post(new { type = "radar-listeners-result", ok = false, message = "Another Windows operation is in progress." }); return; }
            _busy = true;
            try { await RefreshListenersAsync(); }
            catch (Exception ex) { Post(new { type = "radar-listeners-result", ok = false, message = ex.Message }); }
            finally { _busy = false; }
            return;
        }

        if (string.Equals(type, "game-cancel", StringComparison.Ordinal))
        {
            _gameCancellation?.Cancel();
            return;
        }
        if (string.Equals(type, "game-scan", StringComparison.Ordinal) ||
            string.Equals(type, "game-check", StringComparison.Ordinal))
        {
            if (_busy) { Post(new { type = "game-result", ok = false, message = "There are other operations currently underway." }); return; }
            _busy = true;
            using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(40));
            _gameCancellation = cancellation;
            try
            {
                var localIp = RequireString(message, "localIp");
                if (type == "game-scan")
                {
                    var start = ReadBoundedInt(message, "startHost", 1, 1, 254);
                    var end = ReadBoundedInt(message, "endHost", 254, 1, 254);
                    var mode = RequireString(message, "mode");
                    var port = ReadBoundedInt(message, "customPort", 0, 0, 65535);
                    var result = await GameScanner.ScanAsync(localIp, start, end, mode, port, cancellation.Token);
                    Post(new { type = "game-result", ok = true, mode = "scan", result });
                }
                else
                {
                    var targetIp = RequireString(message, "targetIp");
                    var port = ReadBoundedInt(message, "port", 25565, 1, 65535);
                    var protocol = RequireString(message, "protocol");
                    var result = await GameScanner.CheckAsync(localIp, targetIp, port, protocol, cancellation.Token);
                    Post(new { type = "game-result", ok = true, mode = "check", result });
                }
            }
            catch (OperationCanceledException)
            {
                Post(new { type = "game-result", ok = false, cancelled = true, message = "Game detection canceled." });
            }
            catch (Exception ex) { Post(new { type = "game-result", ok = false, message = ex.Message }); }
            finally { _gameCancellation = null; _busy = false; }
            return;
        }

        if (string.Equals(type, "lan-cancel", StringComparison.Ordinal))
        {
            if (_lanCancellation is not null) _lanCancellation.Cancel();
            return;
        }
        if (string.Equals(type, "lan-scan", StringComparison.Ordinal))
        {
            if (_busy) { PostError("Please complete the current operation first."); return; }
            _busy = true;
            using var cancellation = new CancellationTokenSource();
            _lanCancellation = cancellation;
            try
            {
                var localIp = ReadString(message, "localIp");
                var start = ReadBoundedInt(message, "startHost", 1, 1, 254);
                var end = ReadBoundedInt(message, "endHost", 254, 1, 254);
                if (start > end) throw new InvalidOperationException("The start address is greater than the end address.");
                var progress = new Progress<int>(done => Post(new { type = "lan-scan-progress", done, total = end - start + 1 }));
                var result = await LanScanner.ScanAsync(localIp, start, end, progress, cancellation.Token);
                Post(new { type = "lan-scan-result", ok = true, result });
            }
            catch (OperationCanceledException)
            {
                Post(new { type = "lan-scan-result", ok = false, cancelled = true, message = "The scan has been canceled and the results of the previous round are retained." });
            }
            catch (Exception ex) { Post(new { type = "lan-scan-result", ok = false, message = ex.Message }); }
            finally { _lanCancellation = null; _busy = false; }
            return;
        }
        if (string.Equals(type, "lan-rescan-one", StringComparison.Ordinal))
        {
            if (_busy) { PostError("Please complete the current operation first."); return; }
            _busy = true;
            try
            {
                var ip = ReadString(message, "ip");
                var source = ReadString(message, "localIp");
                var result = await LanScanner.ScanSingleAsync(ip, source);
                Post(new { type = "lan-rescan-one-result", ok = true, result });
            }
            catch (Exception ex) { Post(new { type = "lan-rescan-one-result", ok = false, message = ex.Message }); }
            finally { _busy = false; }
            return;
        }
        if (string.Equals(type, "lan-open-share", StringComparison.Ordinal))
        {
            try
            {
                var path = LanScanner.ValidatedUncPath(ReadString(message, "ip"), ReadString(message, "share"));
                var start = new ProcessStartInfo("explorer.exe") { UseShellExecute = true };
                start.ArgumentList.Add(path);
                Process.Start(start);
                Post(new { type = "lan-open-share-result", ok = true });
            }
            catch (Exception ex) { Post(new { type = "lan-open-share-result", ok = false, message = ex.Message }); }
            return;
        }

        if (string.Equals(type, "lan-share-check", StringComparison.Ordinal))
        {
            if (_busy) { PostError("Please complete the current operation first. "); return; }
            _busy = true;
            try {
                var ip = RequireString(message, "ip");
                var share = RequireString(message, "share");
                Post(new { type = "lan-share-check-result", ok = true,
                    result = await LanScanner.TestReadAsync(ip, share) });
            }
            catch (Exception ex) { Post(new { type = "lan-share-check-result", ok = false, message = ex.Message }); }
            finally { _busy = false; }
            return;
        }

        if (string.Equals(type, "admin-open-folder", StringComparison.Ordinal))
        {
            OpenFolder(message);
            return;
        }

        if (_busy)
        {
            PostError("The last local operation is still in progress, please wait.");
            return;
        }

        _busy = true;
        try
        {
            switch (type)
            {
                case "security-scan":
                    await RunSecurityScanAsync();
                    break;
                case "run-diagnostic":
                    await RunDiagnosticAsync();
                    break;
                case "export-snapshot":
                    await ExportSnapshotAsync();
                    break;
                case "admin-refresh":
                    await AdminRefreshAsync();
                    break;
                case "connections-refresh":
                    await ConnectionsRefreshAsync();
                    break;
                case "admin-pick-folder":
                    PickFolder();
                    break;
                case "admin-create-user":
                case "admin-delete-user":
                case "admin-set-user-enabled":
                case "admin-reset-user-password":
                case "admin-create-share":
                case "admin-update-existing-user":
                case "admin-set-existing-user-enabled":
                case "admin-reset-existing-user-password":
                case "admin-set-existing-user-password":
                case "admin-update-share-description":
                case "admin-modify-share-access":
                case "admin-delete-existing-user":
                case "admin-unshare-existing":
                case "admin-delete-share":
                    await AdminActionAsync(type, message);
                    break;
                default:
                    PostError("Unsupported native operation.");
                    break;
            }
        }
        catch (Exception ex)
        {
            PostError("Local operation failed:" + ex.Message);
        }
        finally
        {
            _busy = false;
        }
    }

    private void StopRadar()
    {
        _radarRunId++;
        var old = _radarCancellation;
        _radarCancellation = null;
        try { old?.Cancel(); } catch (ObjectDisposedException) { /* loop already exited */ }
        // The loop owns its CancellationTokenSource and disposes it when it exits.
        Post(new { type = "radar-state", running = false, runId = _radarRunId });
    }

    private async Task RunRadarAsync(IReadOnlyList<NetworkRadar.Target> targets, string localIp,
        int intervalMs, int runId, CancellationTokenSource cancellation)
    {
        try
        {
            await NetworkRadar.RunAsync(targets, localIp, intervalMs, sample =>
            {
                if (IsDisposed || !IsHandleCreated || cancellation.IsCancellationRequested) return;
                try
                {
                    BeginInvoke((Action)(() =>
                    {
                        if (!IsDisposed && runId == _radarRunId)
                            Post(new { type = "radar-sample", runId, sample });
                    }));
                }
                catch (InvalidOperationException) { /* window shutting down */ }
            }, cancellation.Token);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            if (!IsDisposed && IsHandleCreated)
                try { BeginInvoke((Action)(() =>
                {
                    if (runId == _radarRunId)
                        Post(new { type = "radar-state", running = false, runId, error = ex.Message });
                })); } catch (InvalidOperationException) { }
        }
        finally { cancellation.Dispose(); }
    }

    private async Task RefreshListenersAsync()
    {
        try { if (File.Exists(_backend.ListenersJsonPath)) File.Delete(_backend.ListenersJsonPath); }
        catch (IOException) { }
        var result = await _backend.ExportListenersAsync();
        if (result.ExitCode != 0 || !File.Exists(_backend.ListenersJsonPath))
        {
            Post(new { type = "radar-listeners-result", ok = false,
                message = "Failed to read the local port." + ErrorDetail(result) });
            return;
        }
        using var doc = JsonDocument.Parse(BackendRunner.ReadUtf8(_backend.ListenersJsonPath));
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object ||
            !root.TryGetProperty("kind", out var kind) || kind.GetString() != "switchlan-local-tcp-listeners")
            throw new InvalidOperationException("The data format of the local listening port is incorrect.");
        Post(new { type = "radar-listeners-result", ok = true, data = root.Clone() });
    }

    private async Task RunSecurityScanAsync()
    {
        // Delete previous results to prevent silently showing a stale report.
        try { if (File.Exists(_backend.SecurityJsonPath)) File.Delete(_backend.SecurityJsonPath); }
        catch (IOException) { /* next scan reports failure if path cannot be updated */ }
        var result = await _backend.RunSecurityScanAsync();
        if (result.ExitCode != 0 || !File.Exists(_backend.SecurityJsonPath))
        {
            Post(new { type = "security-scan-result", ok = false,
                message = "The local security check failed." + ErrorDetail(result) });
            return;
        }
        using var doc = JsonDocument.Parse(BackendRunner.ReadUtf8(_backend.SecurityJsonPath));
        if (doc.RootElement.ValueKind != JsonValueKind.Object ||
            !doc.RootElement.TryGetProperty("kind", out var kind) ||
            kind.GetString() != "switchlan-security-scan")
            throw new InvalidOperationException("The security check returns a format exception.");
        Post(new { type = "security-scan-result", ok = true, report = doc.RootElement.Clone() });
    }

    private async Task RunDiagnosticAsync()
    {
        var result = await _backend.RunDiagnosticsAsync();
        if (result.ExitCode != 0 || !File.Exists(_backend.DiagnosticsJsonPath))
        {
            PostError("Diagnosis not completed." + ErrorDetail(result));
            return;
        }

        var json = BackendRunner.ReadUtf8(_backend.DiagnosticsJsonPath);
        using var document = JsonDocument.Parse(json);
        var checks = document.RootElement.TryGetProperty("checks", out var checksElement) &&
                     checksElement.ValueKind == JsonValueKind.Array
            ? checksElement.GetArrayLength()
            : 0;

        Post(new
        {
            type = "diagnostic-result",
            ok = true,
            checks,
            reportPath = _backend.DiagnosticsMarkdownPath
        });
    }

    private async Task<JsonElement?> TryExportSnapshotAsync()
    {
        _lastSnapshotFailure = string.Empty;
        // Never mistake a previous run's snapshot for a successful new read.
        try
        {
            if (File.Exists(_backend.SnapshotPath)) File.Delete(_backend.SnapshotPath);
        }
        catch (Exception ex)
        {
            _lastSnapshotFailure = "Unable to remove old snapshot:" + ex.Message;
            DesktopLog.Write(_lastSnapshotFailure);
            return null;
        }

        var result = await _backend.ExportSnapshotAsync();
        if (result.ExitCode != 0 || !File.Exists(_backend.SnapshotPath))
        {
            _lastSnapshotFailure = "Windows snapshot script execution failed." + ErrorDetail(result);
            DesktopLog.Write(_lastSnapshotFailure);
            return null;
        }
        try
        {
            using var document = JsonDocument.Parse(BackendRunner.ReadUtf8(_backend.SnapshotPath));
            if (document.RootElement.ValueKind != JsonValueKind.Object)
                throw new InvalidDataException("Snapshot root node is not a JSON object.");
            return document.RootElement.Clone();
        }
        catch (Exception ex) when (ex is JsonException or IOException or InvalidDataException)
        {
            _lastSnapshotFailure = "Windows snapshot file is not readable:" + ex.Message;
            DesktopLog.Write(_lastSnapshotFailure);
            return null;
        }
    }

    private async Task ExportSnapshotAsync()
    {
        var snapshot = await TryExportSnapshotAsync();
        if (snapshot is null)
        {
            PostError("Snapshot export not completed:" + _lastSnapshotFailure + " Please run local diagnostics.");
            return;
        }

        Post(new
        {
            type = "snapshot-result",
            ok = true,
            snapshot,
            managed = _backend.ReadManagedState()
        });
    }

    private async Task ConnectionsRefreshAsync()
    {
        // Stale data must not be mistaken for a fresh, complete read.
        try { if (File.Exists(_backend.ConnectionsJsonPath)) File.Delete(_backend.ConnectionsJsonPath); }
        catch (Exception ex)
        {
            Post(new { type = "connections-result", ok = false, message = "Unable to delete expired session list:" + ex.Message });
            return;
        }
        var result = await _backend.ExportConnectionsAsync();
        if (result.ExitCode != 0 || !File.Exists(_backend.ConnectionsJsonPath))
        {
            Post(new { type = "connections-result", ok = false,
                message = "Windows SMB session read failed." + ErrorDetail(result) });
            return;
        }
        try
        {
            using var document = JsonDocument.Parse(BackendRunner.ReadUtf8(_backend.ConnectionsJsonPath));
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object ||
                !root.TryGetProperty("kind", out var kind) ||
                kind.GetString() != "switchlan-local-smb-connections")
                throw new InvalidDataException("Session list format is not as expected.");
            Post(new { type = "connections-result", ok = true, data = root.Clone() });
        }
        catch (Exception ex) when (ex is JsonException or IOException or InvalidDataException)
        {
            Post(new { type = "connections-result", ok = false,
                message = "Session list cannot be parsed:" + ex.Message });
        }
        finally
        {
            // Remote identities and file paths need not remain on disk once delivered to the UI.
            try { File.Delete(_backend.ConnectionsJsonPath); } catch { /* locked/removed */ }
        }
    }

    private async Task AdminRefreshAsync()
    {
        DesktopLog.Write("Windows snapshot refresh started.");
        var snapshot = await TryExportSnapshotAsync();
        if (snapshot is null)
        {
            DesktopLog.Write("Windows snapshot refresh failed: " + _lastSnapshotFailure);
            PostError("Unable to read native snapshot:" + _lastSnapshotFailure);
            return;
        }

        // A damaged/old bookkeeping file must not hide the actual Windows inventory.
        // Do not rewrite the registry or claim corrupt records are verified ownership.
        JsonElement managed;
        try { managed = _backend.ReadManagedState(); }
        catch (Exception ex)
        {
            DesktopLog.Write("Managed registry read failed; Windows inventory remains available: " + ex.GetType().Name);
            using var empty = JsonDocument.Parse("{\"users\":[],\"shares\":[]}");
            managed = empty.RootElement.Clone();
        }
        Post(new
        {
            type = "admin-result",
            ok = true,
            operation = "admin-refresh",
            message = "The machine status has been refreshed.",
            snapshot,
            managed
        });
        DesktopLog.Write("Windows snapshot refresh response posted to WebView2.");
    }

    private async Task AdminActionAsync(string type, JsonElement message)
    {
        var request = new Dictionary<string, object?>();
        switch (type)
        {
            case "admin-create-user":
                request["action"] = "create-user";
                request["name"] = RequireString(message, "name");
                request["passwordMode"] = GetOptionalString(message, "passwordMode");
                if (request["passwordMode"] as string == "custom")
                    request["password"] = RequireSecret(message, "password");
                break;
            case "admin-delete-user":
                request["action"] = "delete-user";
                request["name"] = RequireString(message, "name");
                break;
            case "admin-set-user-enabled":
                request["action"] = "set-user-enabled";
                request["name"] = RequireString(message, "name");
                if (!message.TryGetProperty("enabled", out var enabledElement) ||
                    (enabledElement.ValueKind != JsonValueKind.True && enabledElement.ValueKind != JsonValueKind.False))
                {
                    throw new InvalidOperationException("The enabled parameter format is incorrect.");
                }
                request["enabled"] = enabledElement.GetBoolean();
                break;
            case "admin-reset-user-password":
                request["action"] = "reset-user-password";
                request["name"] = RequireString(message, "name");
                break;
            case "admin-create-share":
                request["action"] = "create-share";
                request["name"] = RequireString(message, "name");
                request["path"] = RequireString(message, "path");
                request["account"] = RequireString(message, "account");
                request["accountSid"] = RequireString(message, "accountSid");
                var right = RequireString(message, "right");
                request["right"] = right.Equals("read", StringComparison.OrdinalIgnoreCase)
                    ? "Read"
                    : right.Equals("change", StringComparison.OrdinalIgnoreCase)
                        ? "Change"
                        : throw new InvalidOperationException("Sharing permissions can only be read or change.");
                break;
            case "admin-update-existing-user":
                request["action"] = "update-existing-user";
                request["name"] = RequireString(message, "name");
                request["sid"] = RequireString(message, "sid");
                request["fullName"] = GetStringOrEmpty(message, "fullName");
                request["description"] = GetStringOrEmpty(message, "description");
                break;
            case "admin-set-existing-user-enabled":
                request["action"] = "set-existing-user-enabled";
                request["name"] = RequireString(message, "name");
                request["sid"] = RequireString(message, "sid");
                if (!message.TryGetProperty("enabled", out var existingEnabled) ||
                    (existingEnabled.ValueKind != JsonValueKind.True && existingEnabled.ValueKind != JsonValueKind.False))
                    throw new InvalidOperationException("The enabled parameter format is incorrect.");
                request["enabled"] = existingEnabled.GetBoolean();
                break;
            case "admin-set-existing-user-password":
                request["action"] = "set-existing-user-password";
                request["name"] = RequireString(message, "name");
                request["sid"] = RequireString(message, "sid");
                request["password"] = RequireSecret(message, "password");
                break;
            case "admin-reset-existing-user-password":
                request["action"] = "reset-existing-user-password";
                request["name"] = RequireString(message, "name");
                request["sid"] = RequireString(message, "sid");
                break;
            case "admin-update-share-description":
                request["action"] = "update-share-description";
                request["name"] = RequireString(message, "name");
                request["expectedPath"] = RequireString(message, "expectedPath");
                request["expectedDescription"] = GetStringOrEmpty(message, "expectedDescription");
                request["description"] = GetStringOrEmpty(message, "description");
                break;
            case "admin-modify-share-access":
                request["action"] = "modify-share-access";
                request["name"] = RequireString(message, "name");
                request["account"] = RequireString(message, "account");
                request["sid"] = RequireString(message, "sid");
                request["expectedPath"] = RequireString(message, "expectedPath");
                var oldRight = RequireString(message, "expectedRight");
                if (oldRight is not ("None" or "Read" or "Change" or "Full"))
                    throw new InvalidOperationException("Original authorization must be None / Read / Change / Full.");
                request["expectedRight"] = oldRight;
                var newRight = RequireString(message, "right");
                if (newRight is not ("Read" or "Change" or "Remove"))
                    throw new InvalidOperationException("Sharing authorization can only be Read/Change/Remove.");
                request["right"] = newRight;
                break;
            case "admin-delete-existing-user":
                request["action"] = "delete-existing-user";
                request["name"] = RequireString(message, "name");
                request["sid"] = RequireString(message, "sid");
                if (!message.TryGetProperty("preserveNtfs", out var preserveNtfs) ||
                    preserveNtfs.ValueKind != JsonValueKind.True)
                    throw new InvalidOperationException("You must first confirm that deletion will not clean up NTFS permissions.");
                request["preserveNtfs"] = true;
                break;
            case "admin-unshare-existing":
                request["action"] = "unshare-existing";
                request["name"] = RequireString(message, "name");
                request["expectedPath"] = RequireString(message, "expectedPath");
                break;
            case "admin-delete-share":
                request["action"] = "delete-share";
                request["name"] = RequireString(message, "name");
                break;
            default:
                throw new InvalidOperationException("Unsupported management operation.");
        }

        var result = await _backend.RunAdminRequestAsync(request);
        if (!result.Ok)
        {
            Post(new
            {
                type = "admin-result",
                ok = false,
                message = result.Message
            });
            return;
        }

        string? password = null;
        if (result.Data is JsonElement data &&
            data.ValueKind == JsonValueKind.Object &&
            data.TryGetProperty("password", out var passwordElement) &&
            passwordElement.ValueKind == JsonValueKind.String)
        {
            password = passwordElement.GetString();
        }

        var snapshot = await TryExportSnapshotAsync();
        // Destructive actions must be independently rechecked against Windows.
        // An unreadable/partial snapshot is not evidence of successful removal.
        bool? verified = null;
        if (type is "admin-delete-existing-user" or "admin-unshare-existing" or
            "admin-delete-user" or "admin-delete-share")
        {
            var key = type.Contains("user", StringComparison.Ordinal) ? "users" : "shares";
            var readFailure = key == "users" ? "Unable to read by local user" : "SMB share cannot be read";
            if (snapshot is JsonElement snap &&
                snap.TryGetProperty(key, out var objects) && objects.ValueKind == JsonValueKind.Array &&
                (!snap.TryGetProperty("warnings", out var warnings) ||
                 warnings.ValueKind != JsonValueKind.Array ||
                 !warnings.EnumerateArray().Any(w => w.ValueKind == JsonValueKind.String &&
                     (w.GetString() ?? "").Contains(readFailure, StringComparison.Ordinal))))
            {
                var name = (string)request["name"]!;
                verified = !objects.EnumerateArray().Any(x =>
                    x.ValueKind == JsonValueKind.Object &&
                    x.TryGetProperty("name", out var value) &&
                    string.Equals(value.GetString(), name, StringComparison.OrdinalIgnoreCase));
            }
        }
        Post(new
        {
            type = "admin-result",
            ok = true,
            operation = type,
            verified,
            message = result.Message,
            snapshot,
            managed = _backend.ReadManagedState(),
            data = result.Data,
            password
        });
    }

    private void PickFolder()
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Select folders to share",
            UseDescriptionForTitle = true,
            ShowNewFolderButton = true
        };
        var selected = dialog.ShowDialog(this) == DialogResult.OK
            ? dialog.SelectedPath
            : null;
        Post(new { type = "folder-picked", path = selected });
    }

    private void OpenFolder(JsonElement message)
    {
        try
        {
            var path = RequireString(message, "path");
            if (!Directory.Exists(path))
            {
                PostError("Folder does not exist:" + path);
                return;
            }
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            PostError("Unable to open folder:" + ex.Message);
        }
    }

    private static string RequireString(JsonElement message, string propertyName)
    {
        if (!message.TryGetProperty(propertyName, out var element) ||
            element.ValueKind != JsonValueKind.String)
        {
            throw new InvalidOperationException("Missing field:" + propertyName);
        }

        var value = element.GetString();
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException("Field cannot be empty:" + propertyName);
        }
        return value.Trim();
    }

    private static string RequireSecret(JsonElement message, string propertyName)
    {
        if (!message.TryGetProperty(propertyName, out var element) ||
            element.ValueKind != JsonValueKind.String)
            throw new InvalidOperationException("The password field is malformed.");
        var value = element.GetString() ?? "";
        if (value.Length is < 1 or > 128 || value.Any(char.IsControl))
            throw new InvalidOperationException("Please enter a password of 1–128 characters without control characters. Acceptance is determined by Windows Password Policy.");
        // Never silently trim a password; Windows enforces local or domain password policy.
        return value;
    }

    private static string GetOptionalString(JsonElement message, string propertyName)
    {
        return message.TryGetProperty(propertyName, out var element) &&
               element.ValueKind == JsonValueKind.String ? element.GetString() ?? "" : "";
    }

    private static string GetStringOrEmpty(JsonElement message, string propertyName)
    {
        if (!message.TryGetProperty(propertyName, out var element) || element.ValueKind != JsonValueKind.String)
            throw new InvalidOperationException("Missing field:" + propertyName);
        return element.GetString() ?? string.Empty;
    }

    private void OpenDiagnostics()
    {
        if (!File.Exists(_backend.DiagnosticsMarkdownPath))
        {
            PostError("There is no diagnostic report yet, please click \"Local Diagnosis\" first.");
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo(_backend.DiagnosticsMarkdownPath)
            {
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            PostError("Unable to open diagnostic report:" + ex.Message);
        }
    }

    private static string ReadString(JsonElement obj, string key)
    {
        return obj.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? "" : "";
    }
    private static int ReadBoundedInt(JsonElement obj, string key, int fallback, int min, int max)
    {
        if (!obj.TryGetProperty(key, out var value)) return fallback;
        if (!value.TryGetInt32(out var number) || number < min || number > max)
            throw new InvalidOperationException("The scan range is illegal.");
        return number;
    }

    private void PostError(string message)
    {
        Post(new { type = "desktop-error", message = Trim(message) });
    }

    private void Post(object payload)
    {
        var core = _webView.CoreWebView2;
        if (core is null)
        {
            return;
        }

        core.PostWebMessageAsJson(JsonSerializer.Serialize(payload));
    }

    private static string ErrorDetail(PowerShellResult result)
    {
        var detail = string.IsNullOrWhiteSpace(result.StandardError)
            ? result.StandardOutput
            : result.StandardError;
        detail = detail.Trim();
        return string.IsNullOrWhiteSpace(detail)
            ? "Exit code " + result.ExitCode + "。"
            : "Exit code " + result.ExitCode + "：" + Trim(detail);
    }

    private static string Trim(string value)
    {
        value = value.Trim();
        return value.Length <= 600 ? value : value[..600] + "…";
    }
}
