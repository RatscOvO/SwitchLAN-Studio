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
                speed = n.Speed > 0 ? (n.Speed / 1000000).ToString() + " Mbps" : "未知" }))
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
        if (candidates.Count == 0) throw new InvalidOperationException("没有活动的私有 IPv4 网卡。");
        if (!string.IsNullOrWhiteSpace(requestedIp))
        {
            var match = candidates.FirstOrDefault(c => c.Ip.ToString() == requestedIp);
            if (match.Ip == null) throw new InvalidOperationException("选择的网卡地址已失效，请刷新本机环境。");
            return (match.Ip, match.Name, match.Prefix);
        }
        var best = candidates.OrderByDescending(c => c.Priority).First();
        return (best.Ip, best.Name, best.Prefix);
    }

    internal static async Task<object> ScanAsync(string? localIp = null, int startHost = 1,
        int endHost = 254, IProgress<int>? progress = null, CancellationToken cancellationToken = default)
    {
        if (startHost < 1 || endHost > 254 || startHost > endHost || endHost - startHost > 253)
            throw new InvalidOperationException("扫描范围必须在 1–254 之间，起始地址不可大于结束地址。");
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
                catch (TimeoutException) { status = "SMB 可连接，但共享枚举超时"; }
                catch (Exception ex) when (ex is not OperationCanceledException) { status = "SMB 可连接，但共享枚举失败"; }
            }
            else status = item.Smb ? "445 可连接，达到枚举上限" : "设备响应 Ping，但 SMB 445 未连接";
            var hostname = hostnameChecks++ < 24 ? await ResolveHostNameAsync(item.Ip) : "";
            devices.Add(new { ip = item.Ip, hostname, ping = item.Ping, pingMs = item.Latency,
                port445 = item.Smb, status, shares });
        }
        return new { subnet = prefix + ".0/24", localIp = selected.Ip.ToString(),
            interfaceName = selected.Name, total = endHost - startHost + 1,
            startHost, endHost, devices,
            message = "TCP 445 由所选网卡地址发起。ICMP Ping 使用 Windows 路由表选择出站接口；Ping 响应不保证共享可访问。" };
    }

    internal static async Task<object> ScanSingleAsync(string ip, string? localIp = null)
    {
        if (!IPAddress.TryParse(ip, out var target) || target.AddressFamily != AddressFamily.InterNetwork || !IsPrivate(target))
            throw new InvalidOperationException("单台探测仅支持私有 IPv4 地址。");
        var selected = ResolveInterface(localIp);
        var baseIp = selected.Ip.GetAddressBytes();
        var dest = target.GetAddressBytes();
        if (baseIp[0] != dest[0] || baseIp[1] != dest[1] || baseIp[2] != dest[2])
            throw new InvalidOperationException("只能单独重测当前选中 /24 网段里的设备。");
        var ping = await ProbePingDetailedAsync(ip);
        var smb = await ProbePortAsync(ip, selected.Ip);
        string[] shares = [];
        var status = smb ? "SMB 可连接，尚未列出共享" : "445 未就绪；可能未开启或被防火墙过滤";
        if (smb)
        {
            try
            {
                var value = await Task.Run(() => EnumerateShares(ip)).WaitAsync(TimeSpan.FromSeconds(3));
                shares = value.Names;
                status = value.Status;
            }
            catch (TimeoutException) { status = "共享枚举超时"; }
            catch { status = "共享枚举失败"; }
        }
        var hostname = await ResolveHostNameAsync(ip);
        return new { ip, hostname, ping = ping.Replied, pingMs = ping.Latency, port445 = smb, shares, status };
    }

    internal static string ValidatedUncPath(string ip, string share)
    {
        if (!IPAddress.TryParse(ip, out var parsed) || parsed.AddressFamily != AddressFamily.InterNetwork || !IsPrivate(parsed))
            throw new InvalidOperationException("只允许打开私有 IPv4 共享。");
        if (string.IsNullOrWhiteSpace(share) || share.Length > 80 || share is "." or ".." ||
            share.EndsWith('$') || share.Any(c => char.IsControl(c) || c is '\\' or '/' or ':' or '*' or '?' or '"' or '<' or '>' or '|'))
            throw new InvalidOperationException("共享名称无效。");
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
                return ([], rc == 5 ? "Windows 拒绝列出共享（没有足够的枚举权限）" :
                    $"Windows 无法枚举共享（错误码 {rc}）");
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
                "已列出普通共享名称；尚未验证当前账户是否能读取文件");
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
            return ReadCheck(ip, share, "unknown", "有其他远端读取检查尚未结束，请稍后重试。", null);
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
            return ReadCheck(ip, share, "readable", "当前 Windows 身份成功列举目录；没有验证文件内容读取、写入或删除。", null);
        }
        catch (TimeoutException)
        {
            return ReadCheck(ip, share, "unknown", "列目录已超时，无法确认权限。底层 SMB 请求可能尚未结束。", null);
        }
        catch (UnauthorizedAccessException ex)
        {
            return ReadCheck(ip, share, "denied", "Windows 拒绝当前身份列举目录；资源管理器可能支持其他合法凭据。", ex.HResult & 0xFFFF);
        }
        catch (System.Security.SecurityException ex)
        {
            return ReadCheck(ip, share, "denied", "Windows 安全策略拒绝目录列举。", ex.HResult & 0xFFFF);
        }
        catch (DirectoryNotFoundException ex)
        {
            return ReadCheck(ip, share, "unknown", "共享路径不存在或不可达；先前发现的共享可能已被撤销。", ex.HResult & 0xFFFF);
        }
        catch (IOException ex)
        {
            return ReadCheck(ip, share, "unknown", "目录列举发生 Windows I/O 错误；可能涉及网络、凭据或 SMB 配置。", ex.HResult & 0xFFFF);
        }
        catch (Exception ex)
        {
            return ReadCheck(ip, share, "unknown", "目录列举失败，尚不能确认权限。", ex.HResult & 0xFFFF);
        }
    }

    private static object ReadCheck(string ip, string share, string outcome, string status, int? errorCode) =>
        new { ip, share, readable = outcome == "readable", outcome, status,
              errorCode, checkedAt = DateTimeOffset.Now.ToString("o") };

}
