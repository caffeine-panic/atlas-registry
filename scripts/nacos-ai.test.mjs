import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [backend, app, dialog, registry, build, capability] = await Promise.all([
  readFile(
    new URL("../src-tauri/src/registry/nacos_ai.rs", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/NacosAiDialog.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/registry.ts", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/build.rs", import.meta.url), "utf8"),
  readFile(
    new URL("../src-tauri/capabilities/default.json", import.meta.url),
    "utf8",
  ),
]);

test("Nacos AI Registry exposes only capability, list, and read commands", () => {
  for (const command of [
    "get_nacos_ai_capability",
    "list_nacos_ai_assets",
    "read_nacos_ai_asset",
  ]) {
    assert.match(build, new RegExp(`"${command}"`));
    assert.match(capability, new RegExp(command.replaceAll("_", "-")));
    assert.match(registry, new RegExp(`"${command}"`));
  }
  assert.doesNotMatch(registry, /(?:create|update|publish|delete)_nacos_ai/);
  assert.doesNotMatch(backend, /Method::(?:POST|PUT|PATCH|DELETE)/);
});

test("the Nacos 3 explorer is capability-gated and visibly read-only", () => {
  assert.match(app, /nacosApiVersion !== "v3"/);
  assert.match(dialog, /只读/);
  assert.match(dialog, /不提供发布或变更操作/);
  assert.match(dialog, /capability\.families/);
  assert.match(dialog, /nextCursor/);
  assert.doesNotMatch(dialog, /executeNacosNativeAction/);
});

test("AI metadata is bounded and payload fields stay behind the Rust IPC boundary", () => {
  assert.match(backend, /MAX_RESPONSE_BYTES: usize = 512 \* 1024/);
  assert.match(backend, /MAX_METADATA_BYTES: usize = 16 \* 1024/);
  assert.match(backend, /SAFE_FIELDS/);
  assert.doesNotMatch(
    backend.match(/const SAFE_FIELDS:[\s\S]*?\];/)?.[0] ?? "",
    /template|content|tools|token|credential|secret/i,
  );
});
