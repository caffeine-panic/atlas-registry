## What changed

Describe the user-visible outcome and why this is the smallest complete slice.

## Verification

- [ ] `npm run format:check`
- [ ] `npm run lint`
- [ ] `npm run test:ui`
- [ ] `npm run build`
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml`

List any real-service or platform-specific verification performed.

## Safety review

- [ ] Network and filesystem IO remain bounded, paginated, or cancellable.
- [ ] Mutations preserve revision/version/fingerprint checks and explicit unknown outcomes.
- [ ] Values, credentials, tokens, endpoints, and other sensitive fields do not cross audit, watch, error, export, diagnostic, or logging boundaries unexpectedly.
- [ ] IPC contract changes include regenerated TypeScript bindings and command registration updates.
- [ ] User-visible, architecture, development, release, or verification documentation is updated where required.

Mark non-applicable items and explain why.
