import assert from "node:assert/strict";
import test from "node:test";

const language = await import("../src/configLanguage.ts");
const validation = await import("../src/configValidation.ts");

test("language detection prefers binary safety, type, extension, then conservative sniffing", () => {
  const address = {
    type: "nacosConfig",
    group: "DEFAULT_GROUP",
    dataId: "application.yaml",
  };
  assert.equal(
    language.detectConfigLanguage({
      address,
      content: '{"ok":true}',
      contentType: "text",
      encoding: "utf8",
    }),
    "yaml",
  );
  assert.equal(
    language.detectConfigLanguage({
      address,
      content: "eyJvayI6dHJ1ZX0=",
      contentType: "json",
      encoding: "base64",
    }),
    "plain",
  );
  assert.equal(
    language.detectConfigLanguage({
      address: { ...address, dataId: "application" },
      content: '{"ok":true}',
      contentType: "text",
      encoding: "utf8",
    }),
    "json",
  );
  assert.equal(
    language.detectConfigLanguage({
      address: { ...address, dataId: "application" },
      content: "enabled: true",
      contentType: "text",
      encoding: "utf8",
    }),
    "plain",
  );
});

test("structured validators report valid input and a navigable first error", () => {
  assert.deepEqual(validation.validateConfig("json", '{"ok":true}'), {
    kind: "valid",
  });
  const json = validation.validateConfig("json", '{\n  "ok":\n}');
  assert.equal(json.kind, "invalid");
  assert.equal(json.issue.line >= 2, true);

  assert.equal(validation.validateConfig("yaml", "key: [").kind, "invalid");
  assert.equal(
    validation.validateConfig("toml", "[a\nkey = 1").kind,
    "invalid",
  );
  assert.deepEqual(validation.validateConfig("properties", "a=b"), {
    kind: "unsupported",
  });
});
