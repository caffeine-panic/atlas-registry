# Atlas Registry

**English** | [简体中文](README.zh-CN.md)

[![Latest release](https://img.shields.io/github/v/release/caffeine-panic/atlas-registry)](https://github.com/caffeine-panic/atlas-registry/releases/latest)
[![Quality](https://github.com/caffeine-panic/atlas-registry/actions/workflows/quality.yml/badge.svg)](https://github.com/caffeine-panic/atlas-registry/actions/workflows/quality.yml)
[![Compatibility](https://github.com/caffeine-panic/atlas-registry/actions/workflows/compatibility.yml/badge.svg)](https://github.com/caffeine-panic/atlas-registry/actions/workflows/compatibility.yml)
[![Downloads](https://img.shields.io/github/downloads/caffeine-panic/atlas-registry/total)](https://github.com/caffeine-panic/atlas-registry/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A production-safe desktop workbench for etcd, ZooKeeper, and Nacos.** Browse live registries, use protocol-native operations, and make version-checked changes with redacted local audit evidence.

Atlas Registry is a cross-platform Tauri application with a React interface and a pure Rust core. It connects directly from your workstation—there is no admin server, browser extension, or sidecar to deploy.

## Why Atlas Registry

- **One incident, three registries.** Inspect etcd, ZooKeeper, and Nacos from one consistent workspace.
- **Native semantics, not lowest-common-denominator CRUD.** Use leases and transactions, ACLs and ephemeral nodes, namespaces and services.
- **Safe mutations by design.** Conditional writes prevent silent overwrites, and ambiguous network outcomes are never reported as ordinary failures or retried blindly.
- **Secrets and values stay contained.** Credentials live in the operating system keychain; audit records, watch events, errors, and diagnostics exclude values and tokens, while exports omit values by default.

## Install

Download the latest signed-update-compatible build from [GitHub Releases](https://github.com/caffeine-panic/atlas-registry/releases/latest).

| Platform | Packages                    |
| -------- | --------------------------- |
| macOS    | Apple Silicon and Intel DMG |
| Windows  | MSI and NSIS installer      |
| Linux    | DEB, RPM, and AppImage      |

The application can check for updates from the title bar. Update artifacts are verified locally before installation. Operating-system installer signing status is documented in each release.

## Protocol-native operations

| Protocol  | Resource workspace                                               | Native operations                                                                                            |
| --------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| etcd      | Prefix/key browsing, binary-safe values, search, watch           | Lease lifecycle and 2–32 operation atomic transactions                                                       |
| ZooKeeper | Lazy znode tree, data and Stat metadata, renewed one-shot watch  | Conditional ACL editing and persistent, sequential, ephemeral, and ephemeral-sequential nodes                |
| Nacos     | Paginated config browsing, cross-page identifier search, history | Namespace, service, persistent instance, and SDK-managed ephemeral instance operations for Nacos 2.x and 3.x |

## Safety model

| Risk                                              | Atlas Registry behavior                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A teammate changed the same resource              | etcd revision, ZooKeeper version/aversion, and Nacos MD5/fingerprint checks reject stale writes      |
| The network failed after submission               | Reports an explicit `mutationOutcomeUnknown`; never performs a blind automatic retry                 |
| The remote write succeeded but local audit failed | Reports `auditIncomplete` separately from remote uncertainty                                         |
| A diagnostic or audit record is shared            | Stores identifiers, versions, sizes, encodings, and hashes—not resource values, passwords, or tokens |
| A cluster contains very large trees or values     | Uses pagination, lazy reads, cancellation, bounded searches, and a 1 MiB inline-value limit          |

Every mutation passes through the audited mutation pipeline. The WebView cannot connect to registry endpoints directly, and connection secrets are stored in the operating system credential vault. See the [architecture and threat boundaries](docs/ARCHITECTURE.md).

## Verified compatibility

The real-service contract suite covers:

- etcd 3.6.11 and 3.7.0;
- ZooKeeper 3.8.6 and 3.9.5;
- Nacos 2.5.2 and 3.2.3.

The suite exercises browsing, guarded mutations, watches, conflicts, and protocol-native operations against isolated services. See the [verification record](docs/VERIFICATION.md) and [development guide](docs/DEVELOPMENT.md).

## Quick start

1. Create a connection profile and run **Test connection**.
2. Open the connection and browse resources from the middle panel.
3. Select a resource to load its value and metadata on demand.
4. Review the environment, target, expected version, and impact before a mutation.
5. If Atlas Registry reports an unknown outcome, refresh or verify the server state before taking another action.

## Known limitations

- ZooKeeper SASL is not supported yet.
- Inline reads and mutations are limited to 1 MiB per value.
- Public installers do not yet use organization-level Apple Developer ID or Windows Authenticode certificates; consult the release notes before installation.

## Development

Requirements: Node.js 22, Rust stable, `protoc`, and the [Tauri 2 system dependencies](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev
```

Before submitting a change, run the same gates as CI:

```bash
npm run format:check
npm run lint
npm run test:ui
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

- [Contributing](CONTRIBUTING.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Development and real-service testing](docs/DEVELOPMENT.md)
- [Release process](docs/RELEASING.md)
- [Security policy](SECURITY.md)

## License

[MIT](LICENSE)
