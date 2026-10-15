# 仅维护与发布 Apple Silicon Mac 版本

- 状态：accepted
- 日期：2026-10-15

## 背景

原发布流程同时构建 Linux x64、Windows x64、macOS Apple Silicon 和 macOS Intel，并执行三平台桌面质量门禁。项目所有者将后续桌面交付范围收敛为 M 系列 Mac，以减少无使用需求的平台构建与验证成本。

## 决策

- 桌面质量门禁与后续发行只支持 `aarch64-apple-darwin`，构建 app/DMG。
- 两个工作流均使用 `macos-15` runner，并验证 `uname -m` 为 `arm64`。该标签对应的架构见 [GitHub runner 参考](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。质量门禁还使用 `lipo -archs` 验证产物仅含 arm64。
- 发布继续使用现有 Tauri 更新签名、GitHub Draft Release 和手动公开流程；更新清单只提供 Apple Silicon 平台。
- 六组 etcd / ZooKeeper / Nacos 真实服务契约继续在 Linux 容器中运行。它们用于验证协议行为，不生成 Linux 桌面安装包。
- 已接受的 Tauri / 纯 Rust 架构决策保留，历史版本的验证证据与已发布资产保留。

## 影响

后续不提供 Windows、Linux 或 Intel Mac 安装包及更新。README、协作指南和发布文档以 Apple Silicon 为当前维护范围；历史文档中对其他平台的验证记录只适用于其标注版本。
