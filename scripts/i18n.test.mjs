import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/i18n.ts", import.meta.url), "utf8");
const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const connectionSource = readFileSync(
  new URL("../src/ConnectionDialog.tsx", import.meta.url),
  "utf8",
);
const settingsSource = readFileSync(
  new URL("../src/SettingsDialog.tsx", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const i18n = await import(dataUrl(output));

test("English and Simplified Chinese catalogs have the same complete key set", () => {
  assert.deepEqual(
    Object.keys(i18n.messages.en).sort(),
    Object.keys(i18n.messages["zh-CN"]).sort(),
  );
  assert.ok(Object.keys(i18n.messages.en).length >= 140);
  for (const locale of ["en", "zh-CN"]) {
    for (const [key, value] of Object.entries(i18n.messages[locale])) {
      assert.ok(value.trim(), `${locale} is missing ${key}`);
    }
  }
});

test("first launch follows supported system locales and otherwise uses English", () => {
  const emptyStorage = { getItem: () => null };
  assert.equal(i18n.loadAppLocale(emptyStorage, ["zh-CN"]), "zh-CN");
  assert.equal(i18n.loadAppLocale(emptyStorage, ["zh-Hans-US"]), "zh-CN");
  assert.equal(i18n.loadAppLocale(emptyStorage, ["en-US"]), "en");
  assert.equal(i18n.loadAppLocale(emptyStorage, ["ja-JP"]), "en");
  assert.equal(i18n.loadAppLocale(emptyStorage, ["zh-TW"]), "en");
});

test("the explicit locale is persisted under its own non-credential key", () => {
  const entries = new Map();
  const storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
  assert.equal(i18n.saveAppLocale("zh-CN", storage), "zh-CN");
  assert.equal(entries.get("atlas.locale"), "zh-CN");
  assert.equal(i18n.loadAppLocale(storage, ["en-US"]), "zh-CN");
  assert.doesNotMatch(
    i18n.localeStorageKey,
    /credential|password|secret|token/i,
  );
});

test("formatting rejects missing and unexpected interpolation values", () => {
  assert.throws(
    () => i18n.formatMessage("Loaded {identifier}"),
    /Missing translation value: identifier/,
  );
  assert.throws(
    () => i18n.formatMessage("Loaded", { identifier: "raw" }),
    /Unexpected translation value: identifier/,
  );
  const sentinel = '<img src=x onerror="operator-value">';
  assert.equal(
    i18n.formatMessage("Loaded {identifier}", { identifier: sentinel }),
    `Loaded ${sentinel}`,
  );
  assert.doesNotMatch(
    `${appSource}\n${connectionSource}\n${settingsSource}`,
    /dangerouslySetInnerHTML|innerHTML\s*=/,
  );
});

test("both locale journeys retain protocol names and operator identifiers", () => {
  const requiredJourneyKeys = [
    "connection.new",
    "connection.test",
    "connection.saveAndConnect",
    "workspace.connections",
    "workspace.connectAndBrowse",
    "workspace.search",
    "workspace.locate",
    "workspace.noMatches",
    "workspace.loadingRegistry",
    "resource.select",
    "resource.version",
    "resource.binaryWarning",
    "resource.validationLocation",
  ];
  for (const locale of ["en", "zh-CN"]) {
    const t = i18n.createTranslator(locale);
    for (const key of requiredJourneyKeys) {
      const template = i18n.messages[locale][key];
      assert.ok(template, `${locale} journey is missing ${key}`);
    }
    const endpoint = "etcd-生产.example:2379";
    assert.ok(t("connection.connected", { endpoint }).includes(endpoint));
    assert.equal("etcd", "etcd");
    assert.equal("ZooKeeper", "ZooKeeper");
    assert.equal("Nacos", "Nacos");
  }
});

test("the read-only UI uses the persisted locale and typed journey keys", () => {
  assert.match(appSource, /useState\(loadAppLocale\)/);
  assert.match(appSource, /saveAppLocale\(nextLocale\)/);
  assert.match(appSource, /connectionEnvironmentLabel\(locale,/);
  assert.match(connectionSource, /t: Translator/);
  assert.match(settingsSource, /value=\{draftLocale\}/);
});

function dataUrl(value) {
  return `data:text/javascript;base64,${Buffer.from(value).toString("base64")}`;
}
