using System.Text;

namespace SwitchLAN.Desktop;

internal static class DesktopLog
{
    public static string LogPath => Path.Combine(Path.GetTempPath(), "SwitchLAN.Desktop.log");

    public static void Write(string message)
    {
        try
        {
            File.AppendAllText(
                LogPath,
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + message + Environment.NewLine,
                Encoding.UTF8);
        }
        catch
        {
            // Logging must never prevent the UI from starting.
        }
    }
}
