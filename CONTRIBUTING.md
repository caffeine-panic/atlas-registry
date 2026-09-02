# Contributing to Atlas Registry

**English** | [简体中文](CONTRIBUTING.zh-CN.md)

This guide is the entry point for human contributors. [AGENTS.md](AGENTS.md) is the authoritative instruction file for AI coding tools; both follow the same project constraints.

## Prerequisites

- Node.js 22, matching CI;
- Rust stable with the `clippy` and `rustfmt` components;
- `protoc`, required by `etcd-client`—set `PROTOC=/path/to/protoc` when it is not on `PATH`;
- the [Tauri 2 system dependencies](https://tauri.app/start/prerequisites/) for your platform.

```bash
npm install
npm run tauri dev
```

## Development loop

1. Branch from `master` and keep commits small.
2. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing a module boundary. Put frontend state rules in pure-function modules; preserve guarded mutations and redaction invariants in Rust.
3. Reproduce bugs with a failing test first. After changing an IPC type, run `npm run generate:contracts` and commit the generated bindings.
4. Run the complete local gate before submitting a change:

```bash
npm run format:check && npm run lint && npm run test:ui && npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Optional real-service tests require local Docker or test clusters. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Coding standards

The tools are the standard:

- **TypeScript, CSS, and Markdown:** Prettier, type-aware ESLint, and `tsc --strict`.
- **Rust:** rustfmt and clippy with `-D warnings`; the crate lints deny unsafe code, `dbg!`, `todo!`, `unimplemented!`, and stdout/stderr printing.
- `src/generated/` contains ts-rs output. Never edit or format it manually.
- Source comments and internal architecture documents use Chinese; identifiers and commit messages use English.

## Commits and pull requests

- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `ci:`, or `chore:`.
- Explain the motivation and alternatives for every new dependency.
- Keep the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` synchronized.
- The quality workflow must pass before merge. Changes to protocol behavior also require the compatibility workflow.
- Update the documentation required by [AGENTS.md](AGENTS.md). Record major technical decisions as a new ADR instead of rewriting an accepted one.

## Safety expectations

Do not weaken these properties:

- values, credentials, and tokens must not cross audit, diagnostic, watch, error, export, or logging boundaries unexpectedly;
- browsing and searches must remain paginated, lazy, cancellable, or otherwise bounded;
- mutations must preserve protocol-specific concurrency checks;
- an ambiguous remote result must remain distinct from a local audit failure and must not be retried blindly;
- secrets belong in the operating system credential vault, not connection profiles or logs.

## Releases

See [docs/RELEASING.md](docs/RELEASING.md). A release tag must match all three version files. The workflow creates a Draft release; it becomes public only after signing, notarization, installation, and update-manifest verification are complete.
