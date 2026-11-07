using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SwitchLAN.Desktop;

// Read-only discovery. No credentials, filesystem access, firewall edits or public IPv4 scanning.
public static class GameScanner
{
    public sealed record GameEndpoint(string ip, int port, string game, string edition,
        string verification, string discovery, string? title, string? version,
        int? online, int? maxPlayers);

    private static readonly byte[] RakNetMagic =
        [0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe,
         0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78];
    private static readonly IPAddress LanGroup = IPAddress.Parse("224.0.2.60");

    public static async Task<object> ScanAsync(string localIp, int start, int end,
        string mode, int customPort, CancellationToken cancel)
    {
        if (!IPAddress.TryParse(localIp, out var source) || source.AddressFamily != AddressFamily.InterNetwork)
            throw new InvalidOperationException("Please select a valid local IPv4 network adapter.");
        var o = source.GetAddressBytes();
        bool privateIp = o[0] == 10 || (o[0] == 172 && o[1] is >= 16 and <= 31) ||
                         (o[0] == 192 && o[1] == 168);
        if (!privateIp || o[3] is 0 or 255)
            throw new InvalidOperationException("Game discovery only supports selected private IPv4 /24 segments.");
        if (start < 1 || end > 254 || start > end || end - start > 253)
            throw new InvalidOperationException("The scanning host number must be between 1–254.");
        if (mode is not ("minecraft" or "other" or "all"))
            throw new InvalidOperationException("Unsupported game scan mode.");
        if (customPort is < 0 or > 65535)
            throw new InvalidOperationException("Custom port range is 1–65535.");

        var endpoints = new ConcurrentDictionary<string, GameEndpoint>();
        var warnings = new ConcurrentBag<string>();
        var hosts = Enumerable.Range(start, end - start + 1)
            .Select(i => new IPAddress([o[0], o[1], o[2], (byte)i])).ToArray();
        void Add(GameEndpoint item)
        {
            endpoints.AddOrUpdate(item.ip + ":" + item.port, item,
                (_, old) => Rank(item.verification) > Rank(old.verification) ? item : old);
        }
        var minecraft = mode is "minecraft" or "all";
        var other = mode is "other" or "all";
        using var limiter = new SemaphoreSlim(20);
        var tcpTasks = new List<Task>();
        foreach (var host in hosts)
        {
            if (minecraft) tcpTasks.Add(ProbeBounded(host, 25565, "Minecraft", "Java", true));
            if (other)
            {
                tcpTasks.Add(ProbeBounded(host, 7777, "Terraria", "TCP", false));
                if (customPort > 0 && customPort != 7777 && (!minecraft || customPort != 25565))
                    tcpTasks.Add(ProbeBounded(host, customPort, "Custom TCP", "Customization", false));
            }
        }
        async Task ProbeBounded(IPAddress host, int port, string game, string edition, bool java)
        {
            await limiter.WaitAsync(cancel);
            try
            {
                var ep = await ProbeTcpAsync(source, host, port, game, edition, java, cancel);
                if (ep != null) Add(ep);
            }
            finally { limiter.Release(); }
        }
        var bedrockTask = minecraft ? ProbeBedrockRangeAsync(source, hosts, Add, warnings, cancel) : Task.CompletedTask;
        var multicastTask = minecraft ? ListenJavaLanAsync(source, hosts, Add, warnings, cancel) : Task.CompletedTask;
        await Task.WhenAll(Task.WhenAll(tcpTasks), bedrockTask, multicastTask);
        return new
        {
            localIp, subnet = $"{o[0]}.{o[1]}.{o[2]}.0/24", scannedHosts = hosts.Length,
            scannedAt = DateTimeOffset.Now.ToString("o"),
            games = endpoints.Values.OrderBy(g => g.game).ThenBy(g => IPAddress.Parse(g.ip).GetAddressBytes()[3])
                .ThenBy(g => g.port).ToArray(),
            warnings = warnings.Distinct().Take(5).ToArray()
        };
    }

    // Explicit single-target check supports other routed private LANs/VLANs, not the public Internet.
    public static async Task<object> CheckAsync(string localIp, string targetIp, int port,
        string protocol, CancellationToken cancel)
    {
        if (!IPAddress.TryParse(localIp, out var local) || !IPAddress.TryParse(targetIp, out var target) ||
            local.AddressFamily != AddressFamily.InterNetwork || target.AddressFamily != AddressFamily.InterNetwork)
            throw new InvalidOperationException("Please enter a valid IPv4 address.");
        var a = local.GetAddressBytes(); var b = target.GetAddressBytes();
        static bool IsPrivate(byte[] octets) => octets[0] == 10 ||
            octets[0] == 172 && octets[1] is >= 16 and <= 31 ||
            octets[0] == 192 && octets[1] == 168;
        if (!IsPrivate(a) || !IsPrivate(b))
            throw new InvalidOperationException("Manual probing only allows private IPv4 addresses and does not scan the public internet.");
        if (port is < 1 or > 65535) throw new InvalidOperationException("The port must be between 1–65535.");
        if (protocol is not ("tcp" or "java" or "bedrock")) throw new InvalidOperationException("Unsupported probe protocol.");
        if (protocol == "bedrock")
        {
            GameEndpoint? reply = null;
            var errors = new ConcurrentBag<string>();
            await ProbeBedrockRangeAsync(local, [target], x => reply = x, errors, cancel, port);
            return new { endpoint = reply, reachable = reply != null, note = reply == null ? "No RakNet response received; this cannot be used to conclude that the server is down." : "Bedrock Edition protocol reply received." };
        }
        var result = await ProbeTcpAsync(local, target, port,
            protocol == "java" ? "Minecraft" : "Custom TCP",
            protocol == "java" ? "Java" : "Customization", protocol == "java", cancel);
        return new { endpoint = result, reachable = result != null,
            note = result == null ? "TCP failed to connect; possibly blocked by firewall or no service currently listening." :
                result.verification == "verified" ? "Minecraft status reply received." : "It is only confirmed that TCP can connect, but not which game it is." };
    }

    private static int Rank(string state) => state switch { "verified" => 3, "advertised" => 2, "tcp-only" => 1, _ => 0 };
    private static async Task<GameEndpoint?> ProbeTcpAsync(IPAddress source, IPAddress host,
        int port, string game, string edition, bool java, CancellationToken cancel)
    {
        using var client = new TcpClient(new IPEndPoint(source, 0));
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancel);
        timeout.CancelAfter(720);
        try { await client.ConnectAsync(host, port, timeout.Token); }
        catch (OperationCanceledException) when (!cancel.IsCancellationRequested) { return null; }
        catch (SocketException) { return null; }
        catch (TimeoutException) { return null; }
        if (!java) return new(host.ToString(), port, game, edition, "tcp-only", "TCP probe", null, null, null, null);
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancel);
            deadline.CancelAfter(1300);
            var stream = client.GetStream();
            using var handshake = new MemoryStream();
            WriteVarint(handshake, 0); WriteVarint(handshake, 767);
            var address = Encoding.UTF8.GetBytes(host.ToString());
            WriteVarint(handshake, address.Length); handshake.Write(address);
            handshake.WriteByte((byte)(port >> 8)); handshake.WriteByte((byte)port);
            WriteVarint(handshake, 1);
            await SendPacket(stream, handshake.ToArray(), deadline.Token);
            await SendPacket(stream, [0], deadline.Token);
            int packetLength = await ReadVarintAsync(stream, deadline.Token);
            if (packetLength is < 3 or > 65536) throw new InvalidDataException("status packet size");
            int packetId = await ReadVarintAsync(stream, deadline.Token);
            if (packetId != 0) throw new InvalidDataException("invalid status id");
            int jsonLength = await ReadVarintAsync(stream, deadline.Token);
            if (jsonLength is < 2 or > 64000) throw new InvalidDataException("invalid json length");
            var json = new byte[jsonLength];
            await stream.ReadExactlyAsync(json.AsMemory(), deadline.Token);
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            var title = root.TryGetProperty("description", out var desc) ? Description(desc) : "Minecraft Java Server";
            var version = root.TryGetProperty("version", out var v) && v.TryGetProperty("name", out var name)
                ? Clean(name.GetString()) : null;
            int? online = null, max = null;
            if (root.TryGetProperty("players", out var players))
            {
                if (players.TryGetProperty("online", out var count) && count.TryGetInt32(out var n)) online = n;
                if (players.TryGetProperty("max", out var cap) && cap.TryGetInt32(out var m)) max = m;
            }
            return new(host.ToString(), port, game, edition, "verified", "Java State Protocol", title, version, online, max);
        }
        catch (OperationCanceledException) when (!cancel.IsCancellationRequested) { }
        catch (Exception e) when (e is IOException or JsonException or InvalidDataException or ArgumentException or InvalidOperationException) { }
        return new(host.ToString(), port, game, edition, "tcp-only", "TCP probe (status protocol unacknowledged)", null, null, null, null);
    }

    private static string? Description(JsonElement node)
    {
        if (node.ValueKind == JsonValueKind.String) return Clean(node.GetString());
        if (node.ValueKind != JsonValueKind.Object) return null;
        var result = node.TryGetProperty("text", out var val) ? val.GetString() ?? "" : "";
        if (node.TryGetProperty("extra", out var extras) && extras.ValueKind == JsonValueKind.Array)
            result += string.Concat(extras.EnumerateArray().Take(12).Select(x => x.ValueKind == JsonValueKind.String ?
                x.GetString() : x.ValueKind == JsonValueKind.Object && x.TryGetProperty("text", out var t) ? t.GetString() : ""));
        return Clean(result);
    }
    private static string? Clean(string? str)
    {
        if (str is null) return null;
        var result = Regex.Replace(str, "§[0-9A-FK-ORa-fk-or]", "");
        result = new string(result.Where(c => !char.IsControl(c)).Take(140).ToArray()).Trim();
        return result.Length == 0 ? null : result;
    }
    private static async Task SendPacket(NetworkStream stream, byte[] body, CancellationToken ct)
    {
        using var output = new MemoryStream();
        WriteVarint(output, body.Length); output.Write(body);
        await stream.WriteAsync(output.ToArray(), ct);
    }
    private static void WriteVarint(Stream output, int value)
    {
        uint number = unchecked((uint)value);
        do { byte b = (byte)(number & 0x7f); number >>= 7; if (number > 0) b |= 0x80; output.WriteByte(b); } while (number > 0);
    }
    private static async Task<int> ReadVarintAsync(Stream input, CancellationToken ct)
    {
        int result = 0;
        for (int i = 0; i < 5; i++)
        {
            var b = new byte[1]; await input.ReadExactlyAsync(b.AsMemory(), ct);
            result |= (b[0] & 0x7f) << (i * 7);
            if ((b[0] & 0x80) == 0) return result;
        }
        throw new InvalidDataException("VarInt too long");
    }

    private static async Task ListenJavaLanAsync(IPAddress source, IPAddress[] hosts,
        Action<GameEndpoint> add, ConcurrentBag<string> warnings, CancellationToken ct)
    {
        try
        {
            using var receiver = new UdpClient(AddressFamily.InterNetwork);
            receiver.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            receiver.ExclusiveAddressUse = false;
            receiver.Client.Bind(new IPEndPoint(IPAddress.Any, 4445));
            receiver.JoinMulticastGroup(LanGroup, source);
            using var timer = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timer.CancelAfter(2700);
            while (!timer.IsCancellationRequested)
            {
                UdpReceiveResult response;
                try { response = await receiver.ReceiveAsync(timer.Token); }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested) { break; }
                var remote = response.RemoteEndPoint.Address;
                if (!hosts.Contains(remote)) continue;
                var payload = Encoding.UTF8.GetString(response.Buffer);
                var match = Regex.Match(payload, @"\[MOTD\](.*?)\[/MOTD\].*?\[AD\](\d{1,5})\[/AD\]", RegexOptions.Singleline);
                if (!match.Success || !int.TryParse(match.Groups[2].Value, out int port) || port is < 1 or > 65535) continue;
                var status = await ProbeTcpAsync(source, remote, port, "Minecraft", "Java", true, ct);
                if (status is not null && status.verification == "verified") add(status);
                else add(new(remote.ToString(), port, "Minecraft", "Java", "advertised", "Java LAN Multicast", Clean(match.Groups[1].Value), null, null, null));
            }
            receiver.DropMulticastGroup(LanGroup);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { }
        catch (SocketException) { warnings.Add("Java LAN multicast listening is not available; TCP 25565 will still be probed. It may be that multicast is restricted or port 4445 is occupied."); }
    }

    private static async Task ProbeBedrockRangeAsync(IPAddress source, IPAddress[] hosts,
        Action<GameEndpoint> add, ConcurrentBag<string> warnings, CancellationToken ct, int port = 19132)
    {
        try
        {
            using var udp = new UdpClient(new IPEndPoint(source, 0));
            var ping = new byte[33];
            ping[0] = 0x01;
            BinaryPrimitives.WriteInt64BigEndian(ping.AsSpan(1, 8), DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            RakNetMagic.CopyTo(ping, 9);
            RandomNumberGenerator.Fill(ping.AsSpan(25, 8));
            var ips = hosts.Select(h => h.ToString()).ToHashSet();
            foreach (var host in hosts)
            {
                ct.ThrowIfCancellationRequested();
                await udp.SendAsync(ping, new IPEndPoint(host, port), ct);
            }
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(1800);
            while (true)
            {
                UdpReceiveResult response;
                try { response = await udp.ReceiveAsync(timeout.Token); }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested) { break; }
                if (!ips.Contains(response.RemoteEndPoint.Address.ToString()) || response.RemoteEndPoint.Port != port) continue;
                var bytes = response.Buffer;
                if (bytes.Length < 35 || bytes[0] != 0x1c || !bytes.AsSpan(17, 16).SequenceEqual(RakNetMagic)) continue;
                int length = BinaryPrimitives.ReadUInt16BigEndian(bytes.AsSpan(33, 2));
                if (length < 4 || length > 1800 || length > bytes.Length - 35) continue;
                var parts = Encoding.UTF8.GetString(bytes, 35, length).Split(';');
                if (parts.Length < 6 || parts[0] != "MCPE") continue;
                int? online = int.TryParse(parts[4], out int x) ? x : null;
                int? maximum = int.TryParse(parts[5], out int y) ? y : null;
                add(new(response.RemoteEndPoint.Address.ToString(), port, "Minecraft", "Bedrock Edition", "verified",
                    "Bedrock RakNet Pong", Clean(parts[1]), Clean(parts[3]), online, maximum));
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { }
        catch (SocketException) { warnings.Add("Bedrock Edition UDP probe encountered network error; no response does not mean the server does not exist."); }
    }
}
