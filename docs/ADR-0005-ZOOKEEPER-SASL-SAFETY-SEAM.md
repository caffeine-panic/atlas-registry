# ADR-0005：ZooKeeper SASL 安全接入接缝

- 状态：暂缓实现
- 日期：2026-09-07

## 背景

#15 要求连接启用 SASL 的 ZooKeeper，同时保持纯 Rust 发布、凭据脱敏和命令面不 panic。现有 `zookeeper-client` 提供 DIGEST-MD5 与 GSSAPI 两条路径。

## 调查结果

- GSSAPI feature 依赖系统 `libgssapi`，会增加各平台原生动态库与票据缓存边界，不符合当前单一纯 Rust 发布约束。
- DIGEST-MD5 不引入系统库，但该机制已由 [RFC 6331](https://www.rfc-editor.org/info/rfc6331) 标记为 obsolete；若未来支持，必须强制与 ZooKeeper TLS 一起使用，并明确它只是旧集群兼容能力。ZooKeeper 从 3.6.0 起可用 `sessionRequireClientSASLAuth=true` 强制会话完成 SASL，见[官方管理指南](https://zookeeper.apache.org/doc/current/zookeeperAdmin.html)。
- 当前使用的 0.11.1 以及 2026-09-07 最新的 0.11.2 都把非法 charset、algorithm、qop、realm 和 `rspauth` 等服务端输入作为 `panic` 路径；引号值含多个转义符时，解析游标也可能不前进。这些输入来自远端，不能当作可信不变量。
- 上游自身的 `sasl::mechanisms::digest_md5::tests::not_utf8_charset` 以 `#[should_panic]` 固化了该行为。因此直接打开 `sasl-digest-md5` 会让恶意或异常服务器触发进程 panic，违反 Atlas Registry 的命令面约束。

## 决策

暂不在 `AuthenticationMode` 或 UI 中暴露 SASL，也不启用相关 Cargo feature。先把 ZooKeeper 连接错误映射集中到 `adapters/zookeeper_error.rs`：认证/授权拒绝、会话过期、超时与传输失败使用独立的脱敏结构化终态，调用方不接触上游错误原文。

这是后续实现的兼容性接缝。只有在以下条件同时满足后才继续 #15：

1. 所选纯 Rust SASL 实现对全部远端 challenge 返回错误而不是 panic，且有超时/取消和畸形输入回归测试；
2. DIGEST-MD5 仅允许在 ZooKeeper TLS profile 上启用，或届时存在同样无系统动态库的更强机制；
3. 密码仍只通过现有系统凭据库/临时 IPC 进入 Rust，错误和日志不包含 challenge、用户名或密码；
4. 在 ZooKeeper 3.8.6 与 3.9.5 的 `sessionRequireClientSASLAuth=true` fixture 上完成 probe、open、browse、错误认证与重连验证。

不采用应用内复制并长期维护 DIGEST-MD5 密码学实现；优先推动或等待上游把 panic 转为普通错误。现有无认证、Digest ACL 认证与 TLS 连接路径保持不变。
