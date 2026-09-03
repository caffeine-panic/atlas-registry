import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("../src/demoWorkspace.ts", import.meta.url);
const source = readFileSync(sourceUrl, "utf8");
const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const captureSource = readFileSync(
  new URL("./capture-demo-screenshot.mjs", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const demo = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);

test("demo mode is explicit and does not use the registry runtime", () => {
  assert.equal(demo.workspaceModeFromSearch(""), "live");
  assert.equal(demo.workspaceModeFromSearch("?demo=1"), "demo");
  assert.equal(demo.workspaceModeFromSearch("?demo=true"), "demo");
  assert.equal(demo.workspaceModeFromSearch("?demo=false"), "live");
  assert.equal(
    demo.searchForWorkspaceMode("?panel=wide", "demo"),
    "?panel=wide&demo=1",
  );
  assert.equal(
    demo.searchForWorkspaceMode("?panel=wide&demo=1", "live"),
    "?panel=wide",
  );
  assert.doesNotMatch(output, /from\s+["']\.\/registry["']/);
  assert.doesNotMatch(
    source,
    /@tauri-apps|\binvoke\s*\(|\bfetch\s*\(|WebSocket|localStorage|sessionStorage/,
  );
});

test("demo bootstrap exposes three isolated reserved-domain sessions", async () => {
  const source = demo.createDemoWorkspaceSource(0);
  const bootstrap = await source.bootstrap();

  assert.equal(source.kind, "demo");
  assert.deepEqual(
    bootstrap.profiles.map((profile) => profile.adapter),
    ["etcd", "zookeeper", "nacos"],
  );
  assert.ok(
    bootstrap.profiles.every((profile) =>
      new URL(
        profile.endpoint.includes("://")
          ? profile.endpoint
          : `demo://${profile.endpoint}`,
      ).hostname.endsWith(".demo.invalid"),
    ),
  );
  assert.ok(bootstrap.document);
  assert.ok(
    bootstrap.rootPage?.nextCursor,
    "root data must demonstrate paging",
  );
  assert.equal(Object.keys(bootstrap.sessions).length, 3);
});

test("demo browse covers pagination, empty folders, and deterministic errors", async () => {
  const source = demo.createDemoWorkspaceSource(0);
  const root = await source.listResources(
    "demo-etcd",
    { type: "root" },
    "operation",
  );
  const next = await source.listResources(
    "demo-etcd",
    { type: "root" },
    "operation",
    root.nextCursor,
  );
  const empty = await source.listResources(
    "demo-etcd",
    { type: "etcdPrefix", prefixBase64: "YXJjaGl2ZS8=" },
    "operation",
  );

  assert.equal(root.items.length, 3);
  assert.equal(next.items.length, 1);
  assert.equal(next.nextCursor, undefined);
  assert.deepEqual(empty.items, []);
  await assert.rejects(
    source.readResource(
      "demo-etcd",
      { type: "etcd", keyBase64: "ZGVtby91bmF2YWlsYWJsZQ==" },
      "operation",
    ),
    /演示错误/,
  );
});

test("demo search is bounded, paged, identifier-only, and repeatable", async () => {
  const source = demo.createDemoWorkspaceSource(0);
  const first = await source.searchResources(
    "demo-nacos",
    { type: "root" },
    "a",
    "operation",
  );
  const repeated = await source.searchResources(
    "demo-nacos",
    { type: "root" },
    "a",
    "operation",
  );

  assert.deepEqual(first, repeated);
  assert.ok(first.items.length <= 2);
  assert.ok(first.scanned <= 4);
  assert.equal("value" in first.items[0], false);
  if (first.nextCursor) {
    const second = await source.searchResources(
      "demo-nacos",
      { type: "root" },
      "a",
      "operation",
      first.nextCursor,
    );
    assert.equal(second.exhaustive, true);
  }
});

test("demo fixtures cannot contain operator-environment sentinels", () => {
  const forbidden = [
    "127.0.0.1",
    "localhost",
    "192.168.",
    "10.0.",
    "172.16.",
    "password",
    "access_token",
    "secret=",
    "/Users/",
    "oneaday",
  ];
  for (const sentinel of forbidden)
    assert.equal(
      source.toLocaleLowerCase().includes(sentinel.toLocaleLowerCase()),
      false,
      `demo source contains forbidden sentinel: ${sentinel}`,
    );
});

test("the production UI reads demo data only through the isolated source", () => {
  assert.match(appSource, /createWorkspaceSource\(workspaceMode\)/);
  assert.match(appSource, /data-workspace-mode=\{workspaceMode\}/);
  assert.match(
    appSource,
    /data-demo-ready=\{demoReady \? "true" : undefined\}/,
  );
  assert.doesNotMatch(
    appSource,
    /(?<!\.)\b(loadConnectionProfiles|registryCapabilities|listResources|readResource|searchResources|openConnection|closeConnection)\s*\(/,
  );
  assert.match(appSource, /!demoMode\s*&&\s*pendingMutation/);
  assert.match(
    appSource,
    /disabled=\{[\s\S]{0,120}demoMode \|\| busy \|\| !document\.version \|\| !writeAllowed[\s\S]{0,40}\}/,
  );
  assert.match(appSource, /disabled=\{demoMode \|\| busy\}/);
  assert.match(appSource, /SYNTHETIC DEMO · READ ONLY/);
});

test("the screenshot workflow waits for the deterministic demo state", () => {
  assert.match(captureSource, /http:\/\/127\.0\.0\.1:1420\/\?demo=1/);
  assert.match(captureSource, /data-demo-ready="true"/);
  assert.match(captureSource, /--disable-background-networking/);
  assert.match(captureSource, /--window-size=1440,900/);
});
