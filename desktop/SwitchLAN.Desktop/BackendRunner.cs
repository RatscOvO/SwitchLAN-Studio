using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace SwitchLAN.Desktop;

internal sealed record PowerShellResult(int ExitCode, string StandardOutput, string StandardError);

internal sealed record AdminResult(bool Ok, string Message, JsonElement? Data);

/// <summary>
/// Invokes the fixed, reviewed read-only PowerShell scripts. No user-supplied
/// script path, command name, or argument is accepted through the WebView bridge.
/// </summary>
internal sealed class BackendRunner
{
    private const int TimeoutSeconds = 90;

    public string AppRoot { get; }
    public string WebRoot { get; }
    public string BackendRoot { get; }
    public string DataRoot { get; }
    public string DiagnosticsDirectory { get; }
    public string DiagnosticsJsonPath { get; }
    public string DiagnosticsMarkdownPath { get; }
    public string SnapshotPath { get; }
    public string SecurityJsonPath { get; }
    public string ConnectionsJsonPath { get; }
    public string ListenersJsonPath { get; }
    public string ManagedRegistryPath { get; }

    public BackendRunner()
    {
        AppRoot = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        WebRoot = Path.Combine(AppRoot, "web");
        BackendRoot = Path.Combine(AppRoot, "backend");
        DataRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SwitchLAN Studio");
        DiagnosticsDirectory = Path.Combine(DataRoot, "diagnostics");
        DiagnosticsJsonPath = Path.Combine(DiagnosticsDirectory, "SwitchLAN-Diagnostics.json");
        DiagnosticsMarkdownPath = Path.Combine(DiagnosticsDirectory, "SwitchLAN-Diagnostics.md");
        SnapshotPath = Path.Combine(DataRoot, "snapshot.json");
        SecurityJsonPath = Path.Combine(DataRoot, "security-scan.json");
        ConnectionsJsonPath = Path.Combine(DataRoot, "smb-connections.json");
        ListenersJsonPath = Path.Combine(DataRoot, "tcp-listeners.json");
        ManagedRegistryPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "SwitchLAN Studio", "managed.json");
    }

    public async Task<PowerShellResult> RunDiagnosticsAsync(CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(DiagnosticsDirectory);
        return await RunScriptAsync(
            "Test-SwitchLANEnvironment.ps1",
            new[] { "-OutputDirectory", DiagnosticsDirectory },
            cancellationToken);
    }

    public async Task<PowerShellResult> ExportSnapshotAsync(CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(DataRoot);
        return await RunScriptAsync(
            "Export-SwitchLANSnapshot.ps1",
            new[] { "-OutputPath", SnapshotPath },
            cancellationToken);
    }

    public async Task<PowerShellResult> ExportConnectionsAsync(CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(DataRoot);
        return await RunScriptAsync("Export-SwitchLANConnections.ps1",
            new[] { "-OutputPath", ConnectionsJsonPath }, cancellationToken);
    }

    public async Task<PowerShellResult> ExportListenersAsync(CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(DataRoot);
        return await RunScriptAsync("Export-SwitchLANListeners.ps1",
            new[] { "-OutputPath", ListenersJsonPath }, cancellationToken);
    }

    public async Task<PowerShellResult> RunSecurityScanAsync(CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(DataRoot);
        return await RunScriptAsync(
            "Export-SwitchLANSecurity.ps1",
            new[] { "-OutputPath", SecurityJsonPath },
            cancellationToken);
    }

    public static string ReadUtf8(string path)
    {
        var text = File.ReadAllText(path, Encoding.UTF8);
        return text.TrimStart('\uFEFF');
    }

    public JsonElement ReadManagedState()
    {
        if (!File.Exists(ManagedRegistryPath))
        {
            using var empty = JsonDocument.Parse("{\"users\":[],\"shares\":[]}");
            return empty.RootElement.Clone();
        }

        using var document = JsonDocument.Parse(ReadUtf8(ManagedRegistryPath));
        return document.RootElement.Clone();
    }

    public async Task<AdminResult> RunAdminRequestAsync(Dictionary<string, object?> request, CancellationToken cancellationToken = default)
    {
        var helperPath = Path.Combine(BackendRoot, "Stage2", "Invoke-SwitchLANManage.ps1");
        if (!File.Exists(helperPath))
        {
            throw new FileNotFoundException("Admin helper not found.", helperPath);
        }

        var requestDirectory = Path.Combine(DataRoot, "requests");
        Directory.CreateDirectory(requestDirectory);
        var id = Guid.NewGuid().ToString("N");
        var requestPath = Path.Combine(requestDirectory, "request-" + id + ".json");
        var resultPath = Path.Combine(requestDirectory, "result-" + id + ".json");

        request["callerSid"] = System.Security.Principal.WindowsIdentity.GetCurrent().User?.Value
            ?? throw new InvalidOperationException("Unable to determine current Windows identity.");

        File.WriteAllText(
            requestPath,
            JsonSerializer.Serialize(request),
            new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));

        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = FindWindowsPowerShell(),
                WorkingDirectory = AppRoot,
                UseShellExecute = true,
                Verb = "runas",
                WindowStyle = ProcessWindowStyle.Hidden,
                Arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File " +
                            Quote(helperPath) + " -RequestPath " + Quote(requestPath) +
                            " -ResultPath " + Quote(resultPath)
            };

            using var process = Process.Start(startInfo)
                ?? throw new InvalidOperationException("Unable to start privilege escalation management process.");

            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromMinutes(3));
            try
            {
                await process.WaitForExitAsync(timeout.Token);
            }
            catch (OperationCanceledException)
            {
                try { process.Kill(entireProcessTree: true); } catch { /* elevated or already exited */ }
                return new AdminResult(false, "The management operation timed out or was canceled.", null);
            }

            if (!File.Exists(resultPath))
            {
                return new AdminResult(false,
                    "The privilege escalation command did not return a result. Please check whether UAC uses another administrator account; if so, please log in to Windows with an administrator account before starting the program. Exit code:" + process.ExitCode, null);
            }

            var json = ReadUtf8(resultPath);
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            var ok = root.TryGetProperty("ok", out var okElement) &&
                     okElement.ValueKind == JsonValueKind.True;
            var message = root.TryGetProperty("message", out var messageElement) &&
                          messageElement.ValueKind == JsonValueKind.String
                ? messageElement.GetString() ?? "Management operation failed."
                : "Management operation failed.";
            JsonElement? data = null;
            if (root.TryGetProperty("data", out var dataElement) &&
                dataElement.ValueKind != JsonValueKind.Null)
            {
                data = dataElement.Clone();
            }
            return new AdminResult(ok, message, data);
        }
        finally
        {
            try { if (File.Exists(requestPath)) File.Delete(requestPath); } catch { }
            try { if (File.Exists(resultPath)) File.Delete(resultPath); } catch { }
        }
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private async Task<PowerShellResult> RunScriptAsync(
        string scriptFileName,
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken)
    {
        var scriptPath = Path.Combine(BackendRoot, scriptFileName);
        if (!File.Exists(scriptPath))
        {
            throw new FileNotFoundException("Backend script not found.", scriptPath);
        }

        var powershell = FindWindowsPowerShell();
        var startInfo = new ProcessStartInfo
        {
            FileName = powershell,
            WorkingDirectory = AppRoot,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };
        startInfo.ArgumentList.Add("-NoLogo");
        startInfo.ArgumentList.Add("-NoProfile");
        startInfo.ArgumentList.Add("-NonInteractive");
        startInfo.ArgumentList.Add("-ExecutionPolicy");
        startInfo.ArgumentList.Add("Bypass");
        startInfo.ArgumentList.Add("-File");
        startInfo.ArgumentList.Add(scriptPath);
        foreach (var argument in arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        using var process = new Process { StartInfo = startInfo };
        if (!process.Start())
        {
            throw new InvalidOperationException("Unable to start Windows PowerShell.");
        }

        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(TimeoutSeconds));
        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException)
        {
            try { process.Kill(entireProcessTree: true); } catch { /* already exited */ }
            try { await process.WaitForExitAsync(CancellationToken.None); } catch { /* ignore */ }
            return new PowerShellResult(-1, await stdoutTask, "Execution timed out or was canceled.");
        }

        return new PowerShellResult(process.ExitCode, await stdoutTask, await stderrTask);
    }

    private static string FindWindowsPowerShell()
    {
        var systemDirectory = Environment.GetFolderPath(Environment.SpecialFolder.System);
        var fullPath = Path.Combine(systemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
        return File.Exists(fullPath) ? fullPath : "powershell.exe";
    }
}
