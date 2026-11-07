using System.Text;

namespace SwitchLAN.Desktop;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        DesktopLog.Write("Main entered.");
        if (args.Any(a => string.Equals(a, "--self-test", StringComparison.OrdinalIgnoreCase)))
        {
            RunSelfTest();
            return;
        }

        try
        {
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (_, e) =>
            {
                DesktopLog.Write("UI exception: " + e.Exception);
                MessageBox.Show(e.Exception.Message, "SwitchLAN Studio", MessageBoxButtons.OK, MessageBoxIcon.Error);
            };
            AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            {
                DesktopLog.Write("Unhandled exception: " + e.ExceptionObject);
            };

            DesktopLog.Write("Starting desktop host.");
            ApplicationConfiguration.Initialize();
            Application.Run(new MainForm());
            DesktopLog.Write("Desktop host exited normally.");
        }
        catch (Exception ex)
        {
            DesktopLog.Write("Startup failure: " + ex);
            MessageBox.Show(
                "SwitchLAN Studio cannot start.\r\n\r\n" + ex.Message,
                "SwitchLAN Studio",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private static void RunSelfTest()
    {
        var output = new StringBuilder();
        try
        {
            var runner = new BackendRunner();
            output.AppendLine("AppRoot=" + runner.AppRoot);
            output.AppendLine("WebRoot=" + runner.WebRoot);
            output.AppendLine("BackendRoot=" + runner.BackendRoot);
            output.AppendLine("WebIndex=" + File.Exists(Path.Combine(runner.WebRoot, "index.html")));

            var diagnostic = runner.RunDiagnosticsAsync().GetAwaiter().GetResult();
            output.AppendLine("DiagnosticExit=" + diagnostic.ExitCode);
            output.AppendLine("DiagnosticJson=" + File.Exists(runner.DiagnosticsJsonPath));
            output.AppendLine("DiagnosticMd=" + File.Exists(runner.DiagnosticsMarkdownPath));

            var snapshot = runner.ExportSnapshotAsync().GetAwaiter().GetResult();
            output.AppendLine("SnapshotExit=" + snapshot.ExitCode);
            output.AppendLine("SnapshotFile=" + File.Exists(runner.SnapshotPath));
            if (File.Exists(runner.SnapshotPath))
            {
                var bytes = File.ReadAllBytes(runner.SnapshotPath);
                output.AppendLine("SnapshotBom=" + (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF));
                output.AppendLine("SnapshotBytes=" + bytes.Length);
                using var parsed = System.Text.Json.JsonDocument.Parse(BackendRunner.ReadUtf8(runner.SnapshotPath));
                var payload = parsed.RootElement;
                var valid = payload.TryGetProperty("kind", out var kind) &&
                            kind.GetString() == "switchlan-readonly-snapshot" &&
                            payload.TryGetProperty("users", out var users) &&
                            users.ValueKind == System.Text.Json.JsonValueKind.Array &&
                            payload.TryGetProperty("shares", out var shares) &&
                            shares.ValueKind == System.Text.Json.JsonValueKind.Array;
                output.AppendLine("SnapshotSchemaValid=" + valid);
                if (!valid) throw new InvalidDataException("Snapshot schema was not recognized.");
            }

            output.AppendLine("OK");
        }
        catch (Exception ex)
        {
            output.AppendLine("FAIL=" + ex);
        }

        var path = Path.Combine(Path.GetTempPath(), "SwitchLAN.Desktop.selftest.txt");
        File.WriteAllText(path, output.ToString(), Encoding.UTF8);
    }
}
