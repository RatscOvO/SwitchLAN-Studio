# SwitchLAN Studio · 中文版

Windows 11 本地账户、SMB 文件共享和局域网资源管理桌面程序，Core 1.4.5 Beta。

[English edition](https://github.com/RatscOvO/SwitchLAN-Studio/tree/main) · [版本说明](README-CORE1.4.5-UX.md) · [安全边界](SECURITY.md)

## 启动

安装 .NET 8 SDK x64 和 Microsoft Edge WebView2 Runtime，完整下载并解压本分支，然后双击 `Start-SwitchLAN.cmd`。首次构建需要联网恢复 NuGet 依赖。单独打开 index.html 不能管理系统。

主要功能包括本地账户管理、SMB 共享与直接权限管理、权限证据分析、入站 SMB 会话查看、局域网发现、游戏发现和网络雷达。写操作通过一次性 UAC helper 执行。

英文版与中文版使用相同的 Windows 账户、共享及本地托管数据，请勿同时操作。同名账户、路径及系统返回的文本不会被翻译。

当前仍为 Beta。编译与浏览器模拟测试不等于真实 UAC、账户修改、NTFS 清理及双机 SMB 验收。测试写操作请使用隔离环境和专用账户。

## 开源许可

MIT，详见 LICENSE；第三方归属见 THIRD_PARTY_NOTICES.md。请勿上传未脱敏的日志、快照、密码或临时请求文件。
