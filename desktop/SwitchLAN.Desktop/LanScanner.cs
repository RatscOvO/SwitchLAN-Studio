using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace SwitchLAN.Desktop;

// Bounded, user-initiated local discovery. No credentials, no write probes,
// no public IPs, no internet routing, and no changes to firewall or shares.
internal static class LanScanner
{
    private const uint DiskTree = 0;
    private const int MaxShareEnumerations = 18;
    // UNC enumerations can block within the Windows SMB redirector after the UI timeout.
    // Limit outstanding work, not merely callers waiting on Task.WaitAsync.
    private const int MaxPendingReadChecks = 4;
    private static int _pendingReadChecks;
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ShareInfo1
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string? Name;
        public uint Type;
        [MarshalAs(UnmanagedType.LPWStr)] public string? Remark;
    }
    [DllImport("Netapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int NetShareEnum(string serverName, int level, out IntPtr buffer,
        int preferredMaxLength, out int entriesRead, out int totalEntries, ref int resumeHandle);
    [DllImport("Netapi32.dll")]
    private static extern int NetApiBufferFree(IntPtr buffer);

    internal static object[] ListInterfaces() => NetworkInterface.GetAllNetworkInterfaces()
        .Where(n => n.OperationalStatus == OperationalStatus.Up &&
                    n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
        .SelectMany(n => n.GetIPProperties().UnicastAddresses
            .Where(u => u.Address.AddressFamily == AddressFamily.InterNetwork && IsPrivate(u.Address))
            .Select(u => new { ip = u.Address.ToString(), name = n.Name,
                interfaceId = n.Id, isVirtual = !(n.NetworkInterfaceType is
                    NetworkInterfaceType.Ethernet or NetworkInterfaceType.Wireless80211),
                prefix = u.PrefixLength,
                gateway = n.GetIPProperties().GatewayAddresses
                    .FirstOrDefault(g => g.Address.AddressFamily == AddressFamily.InterNetwork)?.Address.ToString() ?? "",
                speed = n.Speed > 0 ? (n.Speed / 1000000).ToString() + " Mbps" : "Unknown" }))
        .Cast<object>().ToArray();

    private static (IPAddress Ip, string Name, int Prefix) ResolveInterface(string? requestedIp)
    {
        var candidates = NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
            .SelectMany(n => n.GetIPProperties().UnicastAddresses
                .Where(u => u.Address.AddressFamily == AddressFamily.InterNetwork && IsPrivate(u.Address))
                .Select(u => (Ip: u.Address, Name: n.Name, Prefix: u.PrefixLength,
                    Priority: n.NetworkInterfaceType is NetworkInterfaceType.Ethernet or NetworkInterfaceType.Wireless80211 ? 1 : 0)))
            .ToList();
        if (candidates.Count == 0) throw new InvalidOperationException("There is no active private IPv4 network adapter.");
        if (!string.IsNullOrWhiteSpace(requestedIp))
        {
            var match = candidates.FirstOrDefault(c => c.Ip.ToString() == requestedIp);
            if (match.Ip == null) throw new InvalidOperationException("The selected network adapter address has expired. Please refresh the local environment.");
            return (match.Ip, match.Name, match.Prefix);
        }
        var best = candidates.OrderByDescending(c => c.Priority).First();
        return (best.Ip, best.Name, best.Prefix);
    }

    internal static async Task<object> ScanAsync(string? localIp = null, int startHost = 1,
        int endHost = 254, IProgress<int>? progress = null, CancellationToken cancellationToken = default)
    {
        if (startHost < 1 || endHost > 254 || startHost > endHost || endHost - startHost > 253)
            throw new InvalidOperationException("The scanning range must be between 1–254, and the starting address cannot be greater than the ending address.");
        var selected = ResolveInterface(localIp);
        var octets = selected.Ip.GetAddressBytes();
        var prefix = $"{octets[0]}.{octets[1]}.{octets[2]}";
        var results = new ConcurrentBag<(int Index, string Ip, bool Ping, long? Latency, bool Smb)>();
        using var limiter = new SemaphoreSlim(24);
        var completed = 0;
        var probes = Enumerable.Range(startHost, endHost - startHost + 1).Select(async index =>
        {
            var ip = $"{prefix}.{index}";
            if (ip == selected.Ip.ToString())
            {
                progress?.Report(Interlocked.Increment(ref completed));
                return;
            }
            await limiter.WaitAsync(cancellationToken);
            try
            {
                cancellationToken.ThrowIfCancellationRequested();
                var pingTask = ProbePingDetailedAsync(ip);
                var smbTask = ProbePortAsync(ip, selected.Ip);
                await Task.WhenAll(pingTask, smbTask);
                if (pingTask.Result.Replied || smbTask.Result)
                    results.Add((index, ip, pingTask.Result.Replied, pingTask.Result.Latency, smbTask.Result));
            }
            finally
            {
                limiter.Release();
                progress?.Report(Interlocked.Increment(ref completed));
            }
        });
        await Task.WhenAll(probes);
        var devices = new List<object>();
        var smbCount = 0;
        var hostnameChecks = 0;
        foreach (var item in results.OrderBy(x => x.Index))
        {
            cancellationToken.ThrowIfCancellationRequested();
            string[] shares = [];
            string status;
            if (item.Smb && smbCount++ < MaxShareEnumerations)
            {
                try
                {
                    var enumeration = await Task.Run(() => EnumerateShares(item.Ip), cancellationToken)
                        .WaitAsync(TimeSpan.FromSeconds(3), cancellationToken);
                    shares = enumeration.Names;
                    status = enumeration.Status;
                }
                catch (TimeoutException) { status = "SMB connectable, but share enumeration timed out"; }
                catch (Exception ex) when (ex is not OperationCanceledException) { status = "SMB connectable, but share enumeration failed"; }
            }
            else status = item.Smb ? "445 can be connected, reaching the upper limit of enumeration" : "Device responds to Ping, but SMB 445 is not connected";
            var hostname = hostnameChecks++ < 24 ? await ResolveHostNameAsync(item.Ip) : "";
            devices.Add(new { ip = item.Ip, hostname, ping = item.Ping, pingMs = item.Latency,
                port445 = item.Smb, status, shares });
        }
        return new { subnet = prefix + ".0/24", localIp = selected.Ip.ToString(),
            interfaceName = selected.Name, total = endHost - startHost + 1,
            startHost, endHost, devices,
            message = "TCP 445 initiated by selected network adapter address. ICMP Ping uses Windows routing tables to select the outbound interface; the ping response does not guarantee that the share is accessible." };
    }

    internal static async Task<object> ScanSingleAsync(string ip, string? localIp = null)
    {
        if (!IPAddress.TryParse(ip, out var target) || target.AddressFamily != AddressFamily.InterNetwork || !IsPrivate(target))
            throw new InvalidOperationException("Single-unit probing only supports private IPv4 addresses.");
        var selected = ResolveInterface(localIp);
        var baseIp = selected.Ip.GetAddressBytes();
        var dest = target.GetAddressBytes();
        if (baseIp[0] != dest[0] || baseIp[1] != dest[1] || baseIp[2] != dest[2])
            throw new InvalidOperationException("Only the devices in the currently selected /24 subnet can be retested individually.");
        var ping = await ProbePingDetailedAsync(ip);
        var smb = await ProbePortAsync(ip, selected.Ip);
        string[] shares = [];
        var status = smb ? "SMB connectable, shares not listed yet" : "445 Not ready; may not be enabled or filtered by firewall";
        if (smb)
        {
            try
            {
                var value = await Task.Run(() => EnumerateShares(ip)).WaitAsync(TimeSpan.FromSeconds(3));
                shares = value.Names;
                status = value.Status;
            }
            catch (TimeoutException) { status = "Shared enumeration timeout"; }
            catch { status = "Shared enumeration failed"; }
        }
        var hostname = await ResolveHostNameAsync(ip);
        return new { ip, hostname, ping = ping.Replied, pingMs = ping.Latency, port445 = smb, shares, status };
    }

    internal static string ValidatedUncPath(string ip, string share)
    {
        if (!IPAddress.TryParse(ip, out var parsed) || parsed.AddressFamily != AddressFamily.InterNetwork || !IsPrivate(parsed))
            throw new InvalidOperationException("Only private IPv4 shares are allowed to be opened.");
        if (string.IsNullOrWhiteSpace(share) || share.Length > 80 || share is "." or ".." ||
            share.EndsWith('$') || share.Any(c => char.IsControl(c) || c is '\\' or '/' or ':' or '*' or '?' or '"' or '<' or '>' or '|'))
            throw new InvalidOperationException("The share name is invalid.");
        return @"\\" + ip + @"\" + share;
    }
    private static async Task<string> ResolveHostNameAsync(string ip)
    {
        try
        {
            var entry = await Dns.GetHostEntryAsync(ip).WaitAsync(TimeSpan.FromMilliseconds(450));
            return entry.HostName.Length <= 128 ? entry.HostName : "";
        }
        catch { return ""; }
    }
    private static async Task<(bool Replied, long? Latency)> ProbePingDetailedAsync(string ip)
    {
        try
        {
            using var ping = new Ping();
            var r = await ping.SendPingAsync(ip, 550).WaitAsync(TimeSpan.FromMilliseconds(800));
            return r.Status == IPStatus.Success ? (true, r.RoundtripTime) : (false, null);
        }
        catch { return (false, null); }
    }

    private static async Task<bool> ProbePingAsync(string ip)
    {
        try
        {
            using var p = new Ping();
            var result = await p.SendPingAsync(ip, 500).WaitAsync(TimeSpan.FromMilliseconds(750));
            return result.Status == IPStatus.Success;
        }
        catch { return false; }
    }
    private static async Task<bool> ProbePortAsync(string ip, IPAddress? source = null)
    {
        try
        {
            using var tcp = new TcpClient(AddressFamily.InterNetwork);
            if (source is not null) tcp.Client.Bind(new IPEndPoint(source, 0));
            using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(650));
            await tcp.ConnectAsync(IPAddress.Parse(ip), 445, cts.Token);
            return true;
        }
        catch (Exception e) when (e is SocketException or OperationCanceledException) { return false; }
    }
    private static bool IsPrivate(IPAddress ip)
    {
        var b = ip.GetAddressBytes();
        return b[0] == 10 || (b[0] == 192 && b[1] == 168) ||
            (b[0] == 172 && b[1] >= 16 && b[1] <= 31);
    }
    private static (string[] Names, string Status) EnumerateShares(string ip)
    {
        IntPtr ptr = IntPtr.Zero;
        int resume = 0;
        try
        {
            var rc = NetShareEnum(@"\\" + ip, 1, out ptr, 16384, out int count, out _, ref resume);
            if (rc != 0)
                return ([], rc == 5 ? "Windows refuses to list share (insufficient enumeration permissions)" :
                    $"Windows cannot enumerate shares (error code {rc})");
            int bytes = Marshal.SizeOf<ShareInfo1>();
            var names = new List<string>();
            for (int i = 0; i < Math.Min(count, 128); i++)
            {
                var info = Marshal.PtrToStructure<ShareInfo1>(IntPtr.Add(ptr, bytes * i));
                if ((info.Type & 0xFFFF) == DiskTree &&
                    !string.IsNullOrWhiteSpace(info.Name) && !info.Name.EndsWith('$'))
                    names.Add(info.Name);
            }
            return (names.Distinct(StringComparer.OrdinalIgnoreCase).ToArray(),
                "Common share name listed; current account has not been verified to be able to read the file.");
        }
        finally { if (ptr != IntPtr.Zero) NetApiBufferFree(ptr); }
    }
    // Explicit, read-only per-share check, scoped to current Windows credentials.
    // Outcomes: readable = directory enumeration succeeded; denied = an access-denied
    // error was returned; unknown = network, timeout or other unverified outcome.
    // The underlying Windows redirector call cannot always be cancelled, so the
    // process maintains a strict cap on still-running worker tasks.
    internal static async Task<object> TestReadAsync(string ip, string share)
    {
        var path = ValidatedUncPath(ip, share);
        if (Interlocked.Increment(ref _pendingReadChecks) > MaxPendingReadChecks)
        {
            Interlocked.Decrement(ref _pendingReadChecks);
            return ReadCheck(ip, share, "unknown", "There are other remote read checks that have not yet been completed. Please try again later.", null);
        }
        Task worker;
        try
        {
            worker = Task.Run(() => {
                // Read a directory enumerator only: no remote file is opened or written.
                using var enumerator = Directory.EnumerateFileSystemEntries(path).GetEnumerator();
                _ = enumerator.MoveNext();
            });
        }
        catch
        {
            Interlocked.Decrement(ref _pendingReadChecks);
            throw;
        }
        _ = worker.ContinueWith(completed => {
                // Observe a fault even if the UI timed out earlier.
                if (completed.IsFaulted) { _ = completed.Exception; }
                Interlocked.Decrement(ref _pendingReadChecks);
            }, CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
        try
        {
            await worker.WaitAsync(TimeSpan.FromSeconds(5));
            return ReadCheck(ip, share, "readable", "The current Windows identity successfully enumerated the directory; there was no verification of file contents for reading, writing, or deletion.", null);
        }
        catch (TimeoutException)
        {
            return ReadCheck(ip, share, "unknown", "Directory listing has timed out and permissions cannot be confirmed. The underlying SMB request may not have ended yet.", null);
        }
        catch (UnauthorizedAccessException ex)
        {
            return ReadCheck(ip, share, "denied", "Windows denies the current identity enumeration directory; Explorer may support other legitimate credentials.", ex.HResult & 0xFFFF);
        }
        catch (System.Security.SecurityException ex)
        {
            return ReadCheck(ip, share, "denied", "Windows security policy denies directory enumeration.", ex.HResult & 0xFFFF);
        }
        catch (DirectoryNotFoundException ex)
        {
            return ReadCheck(ip, share, "unknown", "The share path does not exist or is unreachable; a previously discovered share may have been revoked.", ex.HResult & 0xFFFF);
        }
        catch (IOException ex)
        {
            return ReadCheck(ip, share, "unknown", "A Windows I/O error occurred while enumerating the directory; possibly involving network, credentials, or SMB configuration.", ex.HResult & 0xFFFF);
        }
        catch (Exception ex)
        {
            return ReadCheck(ip, share, "unknown", "Directory enumeration failed and permissions cannot be confirmed yet.", ex.HResult & 0xFFFF);
        }
    }

    private static object ReadCheck(string ip, string share, string outcome, string status, int? errorCode) =>
        new { ip, share, readable = outcome == "readable", outcome, status,
              errorCode, checkedAt = DateTimeOffset.Now.ToString("o") };

}
