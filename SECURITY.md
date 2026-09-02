# Security Policy

Atlas Registry connects to production configuration and service-discovery systems. Security reports are treated as sensitive even when they do not include credentials or resource values.

## Supported versions

Security fixes are provided for the latest public release. Upgrade to the latest version before reporting an issue that may already have been fixed.

## Report a vulnerability privately

Use GitHub's **Report a vulnerability** form in the repository Security tab. Do not open a public issue for suspected vulnerabilities.

Include:

- the affected Atlas Registry version and operating system;
- the affected adapter and server version;
- minimal reproduction steps;
- the expected and observed security boundary;
- whether credentials, resource values, audit data, update signatures, or mutation outcomes may be exposed or misrepresented.

Do not include live passwords, tokens, private keys, production endpoints, or production resource values. Replace them with synthetic examples. Atlas Registry's diagnostic export is designed to omit these fields and may be attached when useful.

We aim to acknowledge a complete report within three business days and will coordinate disclosure after a fix is available. Please allow a reasonable remediation window before public disclosure.

## High-priority security boundaries

- credentials must remain in the operating system credential vault or transient Rust memory;
- the WebView must not receive passwords, tokens, private keys, or unrestricted network access;
- audit records, watch events, errors, exports, and diagnostics must not leak resource values or credentials;
- update signature verification must not be bypassable;
- a mutation with an ambiguous remote result must not be silently retried or reported as an ordinary failure;
- stale writes must not bypass the protocol's revision, version, aversion, MD5, or fingerprint checks.

The complete design is documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
