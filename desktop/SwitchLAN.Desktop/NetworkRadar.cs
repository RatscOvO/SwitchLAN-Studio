using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace SwitchLAN.Desktop;

/// <summary>
/// Continuous read-only measurement of explicitly selected IPv4 endpoints.
/// A failed ICMP echo does not prove host offline; TCP is an independent observation.
/// No port sweep, remote authentication, firewall mutation or public network enumeration.
/// </summary>
public static class NetworkRadar
{
    public sealed record Target(string id, string name, string ip, int port);
    public sealed record Probe(string id, string ip, int port,
        string icmp, double? icmpMs, string tcp, double? tcpMs);
    public sealed record Traffic(double? receiveBps, double? sendBps, string adapterName, string status);
    public sealed record Sample(string capturedAt, Probe[] probes, Traffic traffic);

    public static IPAddress RequireUnicastIPv4(string value)
    {
        if (!IPAddress.TryParse(value, out var ip) || ip.AddressFamily != AddressFamily.InterNetwork ||
            IPAddress.IsLoopback(ip) || ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.Broadcast) ||
            ip.GetAddressBytes()[0] is >= 224 or 0 || ip.GetAddressBytes()[3] == 255)
            throw new InvalidOperationException("监测目标必须是有效的单播 IPv4 地址（不含回环、多播和广播）。");
        return ip;
    }

    public static async Task RunAsync(IReadOnlyList<Target> targets, string localIp, int intervalMs,
        Action<Sample> report, CancellationToken cancel)
    {
        if (targets.Count > 8) throw new InvalidOperationException("最多同时监测 8 个目标。");
        if (intervalMs is < 1000 or > 10000) throw new InvalidOperationException("监测间隔应为 1–10 秒。");
        var local = IPAddress.Parse(localIp);
        if (local.AddressFamily != AddressFamily.InterNetwork) throw new InvalidOperationException("请选择有效的 IPv4 网卡。");
        foreach (var t in targets)
        {
            RequireUnicastIPv4(t.ip);
            if (t.port is < 0 or > 65535) throw new InvalidOperationException("端口必须在 0–65535（0 表示不检测 TCP）。");
        }
        long? previousRx = null, previousTx = null;
        long previousAt = 0;
        while (!cancel.IsCancellationRequested)
        {
            var started = Stopwatch.GetTimestamp();
            var probes = await Task.WhenAll(targets.Select(x => ProbeAsync(x, cancel)));
            var now = Stopwatch.GetTimestamp();
            var traffic = ReadTraffic(local, previousRx, previousTx, previousAt, now,
                out previousRx, out previousTx, out previousAt);
            cancel.ThrowIfCancellationRequested();
            report(new Sample(DateTimeOffset.Now.ToString("o"), probes, traffic));
            var elapsed = Stopwatch.GetElapsedTime(started);
            var wait = TimeSpan.FromMilliseconds(Math.Max(100, intervalMs - elapsed.TotalMilliseconds));
            await Task.Delay(wait, cancel);
        }
    }

    private static async Task<Probe> ProbeAsync(Target t, CancellationToken cancel)
    {
        var ip = RequireUnicastIPv4(t.ip);
        var pingTask = PingAsync(ip, cancel);
        var tcpTask = t.port > 0 ? TcpAsync(ip, t.port, cancel) : Task.FromResult<(string, double?)>(("not-requested", null));
        await Task.WhenAll(pingTask, tcpTask);
        var a = await pingTask;
        var b = await tcpTask;
        return new Probe(t.id, t.ip, t.port, a.Item1, a.Item2, b.Item1, b.Item2);
    }

    private static async Task<(string, double?)> PingAsync(IPAddress ip, CancellationToken cancel)
    {
        try
        {
            using var ping = new Ping();
            var sw = Stopwatch.StartNew();
            var reply = await ping.SendPingAsync(ip, TimeSpan.FromMilliseconds(950),
                new byte[16], new PingOptions(64, true), cancel);
            sw.Stop();
            return reply.Status switch
            {
                IPStatus.Success => ("ok", (double)reply.RoundtripTime),
                IPStatus.TimedOut => ("timeout", null),
                _ => ("unconfirmed", null)
            };
        }
        catch (OperationCanceledException) when (cancel.IsCancellationRequested) { throw; }
        catch (Exception ex) when (ex is PingException or SocketException or InvalidOperationException or OperationCanceledException)
        { return ("unconfirmed", null); }
    }

    private static async Task<(string, double?)> TcpAsync(IPAddress ip, int port, CancellationToken cancel)
    {
        using var client = new TcpClient();
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancel);
        deadline.CancelAfter(950);
        try
        {
            var sw = Stopwatch.StartNew();
            await client.ConnectAsync(ip, port, deadline.Token);
            sw.Stop();
            return ("ok", Math.Round(sw.Elapsed.TotalMilliseconds, 1));
        }
        catch (OperationCanceledException) when (cancel.IsCancellationRequested) { throw; }
        catch (OperationCanceledException) { return ("timeout", null); }
        catch (SocketException ex) when (ex.SocketErrorCode == SocketError.ConnectionRefused)
        { return ("refused", null); }
        catch (Exception ex) when (ex is SocketException or InvalidOperationException)
        { return ("unconfirmed", null); }
    }

    private static Traffic ReadTraffic(IPAddress localIp, long? previousRx, long? previousTx,
        long previousAt, long now, out long? rx, out long? tx, out long recordedAt)
    {
        rx = null; tx = null; recordedAt = 0;
        try
        {
            var nic = NetworkInterface.GetAllNetworkInterfaces().FirstOrDefault(n =>
                n.GetIPProperties().UnicastAddresses.Any(a => a.Address.Equals(localIp)));
            if (nic is null) return new(null, null, "", "unavailable");
            var stats = nic.GetIPv4Statistics();
            rx = stats.BytesReceived; tx = stats.BytesSent; recordedAt = now;
            if (!previousRx.HasValue || !previousTx.HasValue || previousAt == 0 ||
                rx < previousRx || tx < previousTx)
                return new(null, null, nic.Name, "warming-up");
            var seconds = Stopwatch.GetElapsedTime(previousAt, now).TotalSeconds;
            if (seconds <= 0) return new(null, null, nic.Name, "unavailable");
            return new(Math.Max(0, (rx.Value - previousRx.Value) / seconds),
                Math.Max(0, (tx.Value - previousTx.Value) / seconds), nic.Name, "ok");
        }
        catch (Exception ex) when (ex is NetworkInformationException or InvalidOperationException)
        { return new(null, null, "", "unavailable"); }
    }
}
