import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [manifest, mapper, adr] = await Promise.all([
  readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8"),
  readFile(
    new URL(
      "../src-tauri/src/registry/adapters/zookeeper_error.rs",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL("../docs/ADR-0005-ZOOKEEPER-SASL-SAFETY-SEAM.md", import.meta.url),
    "utf8",
  ),
]);

test("ZooKeeper SASL remains fail-closed until the upstream panic surface is removed", () => {
  const dependency = manifest.match(/^zookeeper-client = .*$/m)?.[0] ?? "";
  assert.doesNotMatch(dependency, /sasl(?:-digest-md5)?/);
  assert.match(adr, /0\.11\.2/);
  assert.match(adr, /RFC 6331/);
});

test("the compatibility seam classifies ZooKeeper connection failures without source text", () => {
  assert.match(mapper, /Error::AuthFailed[\s\S]*permission_denied/);
  assert.match(mapper, /Error::SessionExpired[\s\S]*session_expired/);
  assert.match(mapper, /Error::Timeout[\s\S]*RegistryError::timeout/);
  assert.doesNotMatch(mapper, /format!|to_string\(\)/);
});
