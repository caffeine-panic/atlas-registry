# ADR-0004：内置受管 SSH 隧道

- 状态：已接受
- 日期：2026-09-04

## 背景

不少 etcd 集群只允许经跳板机访问。要求用户长期维护外部 `ssh -L` 进程会把端口冲突、进程清理、身份校验与故障定位留给用户，也破坏 Atlas Registry 的单进程安装体验。

## 决策

仅为 etcd profile 提供显式启用的单跳 SSH 隧道。`ManagedSshTunnel::open` 接收已校验的 profile 与独立 SSH 凭据，返回本机 loopback endpoint 和随会话存活的生命周期句柄；etcd adapter 不感知握手、认证、转发或清理细节。

- 使用纯 Rust/Tokio 的 `russh`，关闭默认 `aws-lc-rs` feature，复用项目现有 `ring`，并启用 RSA 私钥兼容。
- 必须显式固定 `SHA256:<base64>` 主机密钥指纹；不提供 TOFU，主机身份变化返回 `sshHostKey`。
- 支持 SSH 密码和本机私钥文件；密码与私钥口令只通过临时 IPC 或独立的系统凭据库条目进入 Rust。
- 私钥输入仅接受不超过 64 KiB 的普通文件；读取有界，临时编码缓冲在释放时清零。
- 一个 profile 只允许一个远端 etcd endpoint。监听仅绑定 `127.0.0.1`，并发转发上限为 32。
- 隧道句柄随 probe/open 会话释放；取消、超时和关闭会取消监听、终止转发任务并断开 SSH session。

## 被否决的方案

- 调用系统 OpenSSH 或运行 sidecar：会引入外部进程发现、参数差异、孤儿进程和额外发布/签名边界。
- `ssh2`/libssh2：需要额外系统原生库，不符合单一纯 Rust 发布物。
- 支持 `ProxyCommand` 或多跳配置：会重新引入任意外部进程与难以界定的生命周期；首版保持单跳深接口。
- 在 etcd/tonic 传输层直接实现自定义 SSH connector：会把 SSH 细节扩散进协议 adapter，增加升级成本。

## 结果

直接连接路径保持不变；SSH 隧道只在 profile 显式启用时创建。新增依赖扩大了二进制与密码学供应链，因此由锁文件、Clippy、默认测试和 ignored 真实跳板机契约共同守护。当前范围不包含 SSH agent、交互式键盘认证、动态端口转发或多跳。
