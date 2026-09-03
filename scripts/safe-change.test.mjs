import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const safeChangeSource = readFileSync(
  new URL("../src/safeChange.ts", import.meta.url),
  "utf8",
);
const registryErrorSource = readFileSync(
  new URL("../src/registryError.ts", import.meta.url),
  "utf8",
);
const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const dialogSource = readFileSync(
  new URL("../src/SafeChangeDialog.tsx", import.meta.url),
  "utf8",
);
const registryErrorOutput = transpile(registryErrorSource);
const registryErrorUrl = dataUrl(registryErrorOutput);
const safeChangeOutput = transpile(safeChangeSource).replace(
  'from "./registryError"',
  `from "${registryErrorUrl}"`,
);
const safeChange = await import(dataUrl(safeChangeOutput));

const profiles = {
  etcd: profile("etcd", "production"),
  zookeeper: profile("zookeeper", "staging"),
  nacos: profile("nacos", "development"),
};

test("plans identify all protocol tokens without retaining endpoints", () => {
  const expectations = [
    [profiles.etcd, etcdDocument(), "etcd revision compare-and-swap"],
    [
      profiles.zookeeper,
      zookeeperDocument(),
      "ZooKeeper version compare-and-swap",
    ],
    [profiles.nacos, nacosDocument(), "Nacos MD5 conditional publish"],
  ];
  for (const [connection, document, strategy] of expectations) {
    const plan = safeChange.createSafeChangePlan(
      connection,
      document,
      "changed=true",
      `workflow-${connection.adapter}`,
    );
    assert.equal(plan.expectedVersion, document.version);
    assert.equal(plan.after.expectedVersion, document.version);
    assert.equal(safeChange.concurrencyStrategy(connection.adapter), strategy);
    assert.equal("endpoint" in plan, false);
  }
});

test("promotion plans preserve the source encoding and content type", () => {
  const target = etcdDocument();
  const plan = safeChange.createSafeChangePlanFromValue(
    profiles.etcd,
    target,
    { content: "AP8=", encoding: "base64", sizeBytes: 2 },
    "binary-promotion",
    "application/octet-stream",
  );
  assert.deepEqual(plan.after.value, {
    content: "AP8=",
    encoding: "base64",
  });
  assert.equal(plan.after.contentType, "application/octet-stream");
});

test("the structured diff is deterministic and bounded", () => {
  const diff = safeChange.buildBoundedSafeChangeDiff(
    "service: payments\ntimeout: 1000\nretries: 2",
    "service: payments\ntimeout: 1800\nretries: 3\nregion: us-east-1",
  );
  assert.equal(diff.unchanged, 1);
  assert.equal(diff.removed, 2);
  assert.equal(diff.added, 3);
  assert.equal(diff.truncated, false);

  const oversized = safeChange.buildBoundedSafeChangeDiff(
    Array.from({ length: 260 }, (_, index) => `before-${index}`).join("\n"),
    Array.from({ length: 260 }, (_, index) => `after-${index}`).join("\n"),
  );
  assert.equal(oversized.truncated, true);
  assert.ok(oversized.lines.length <= 400);
});

test("the state machine requires a successful preflight before apply", () => {
  const plan = safeChange.createSafeChangePlan(
    profiles.etcd,
    etcdDocument(),
    "changed=true",
    "workflow-state",
  );
  const initial = safeChange.initialSafeChangeState(plan);
  assert.equal(
    safeChange.reduceSafeChange(initial, { type: "startApply" }),
    initial,
  );
  const checking = safeChange.reduceSafeChange(initial, {
    type: "startPreflight",
  });
  const ready = safeChange.reduceSafeChange(checking, {
    type: "preflightReady",
    preflight: { kind: "ready", checkedVersion: "42", checkedAtMs: 1 },
  });
  assert.equal(ready.phase, "ready");
  assert.equal(
    safeChange.reduceSafeChange(ready, { type: "startApply" }).phase,
    "applying",
  );
});

test("preflight reads authoritative state and exposes conflicts", async () => {
  const document = etcdDocument();
  const plan = safeChange.createSafeChangePlan(
    profiles.etcd,
    document,
    "changed=true",
    "workflow-preflight",
  );
  let reads = 0;
  const ready = await safeChange.preflightSafeChange(
    plan,
    async () => {
      reads += 1;
      return document;
    },
    () => 100,
  );
  assert.deepEqual(ready, {
    kind: "ready",
    checkedVersion: "42",
    checkedAtMs: 100,
  });
  const conflict = await safeChange.preflightSafeChange(
    plan,
    async () => ({ ...document, version: "43" }),
    () => 101,
  );
  assert.equal(conflict.kind, "conflict");
  assert.equal(conflict.checkedVersion, "43");
  assert.equal(reads, 1);
});

test("receipt redaction sentinel survives apply and authoritative readback", async () => {
  const document = nacosDocument();
  const proposed = "password=do-not-copy\naccess_token=do-not-copy";
  const plan = safeChange.createSafeChangePlan(
    profiles.nacos,
    document,
    proposed,
    "workflow-applied",
  );
  const calls = [];
  const result = mutationResult(plan.address, "md5-next");
  const authoritative = {
    ...document,
    version: "md5-next",
    value: { content: proposed, encoding: "utf8", sizeBytes: 47 },
  };
  const outcome = await safeChange.applySafeChange(
    plan,
    async () => {
      calls.push("apply");
      return result;
    },
    async () => {
      calls.push("read");
      return authoritative;
    },
  );
  assert.deepEqual(calls, ["apply", "read"]);
  assert.equal(outcome.kind, "applied");
  assert.equal(outcome.readback, "confirmed");

  const receipt = safeChange.serializeSafeChangeReceipt(
    safeChange.buildSafeChangeReceipt(
      plan,
      { kind: "ready", checkedVersion: "md5-old", checkedAtMs: 1 },
      outcome,
      0,
    ),
  );
  assert.match(receipt, /atlasSafeChangeReceipt/);
  assert.match(receipt, /md5-next/);
  assert.doesNotMatch(receipt, /password|access_token|do-not-copy/);
  assert.doesNotMatch(receipt, /service=payments/);
  assert.doesNotMatch(receipt, /registry\.demo\.invalid|endpoint/i);
});

test("conflict, unknown outcome, and audit failure stay distinct without retry", async () => {
  for (const [code, expectedKind] of [
    ["conflict", "conflict"],
    ["outcomeUnknown", "outcomeUnknown"],
    ["auditIncomplete", "auditIncomplete"],
  ]) {
    const document = zookeeperDocument();
    const plan = safeChange.createSafeChangePlan(
      profiles.zookeeper,
      document,
      "changed=true",
      `workflow-${code}`,
    );
    let applies = 0;
    let reads = 0;
    const outcome = await safeChange.applySafeChange(
      plan,
      async () => {
        applies += 1;
        throw registryError(code);
      },
      async () => {
        reads += 1;
        return { ...document, version: "8" };
      },
    );
    assert.equal(outcome.kind, expectedKind);
    assert.equal(applies, 1);
    assert.equal(reads, 1);
    assert.match(safeChange.safeChangeRecovery(outcome), /刷新|核对|审计/);
    assert.equal(
      safeChange.buildSafeChangeReceipt(plan, undefined, outcome, 0).status,
      expectedKind,
    );
  }
});

test("the UI contract wires preflight, single dispatch, readback, and receipt", () => {
  assert.match(appSource, /preflightSafeChange\(\s*plan/);
  assert.match(appSource, /applySafeChange\(/);
  assert.match(
    appSource,
    /return await mutateResource\(\s*plan\.connectionId,\s*mutation,\s*operationId/,
  );
  assert.match(appSource, /buildSafeChangeReceipt\(plan, preflight, outcome\)/);
  assert.match(dialogSource, /SAFE CHANGE CENTER/);
  assert.match(dialogSource, /有界 Before \/ After Diff/);
  assert.match(dialogSource, /单次条件提交/);
  assert.match(dialogSource, /脱敏收据/);
  assert.doesNotMatch(dialogSource, /profile\.endpoint|plan\.endpoint/);
});

function profile(adapter, environment) {
  return {
    id: `connection-${adapter}`,
    name: `${adapter} connection`,
    adapter,
    endpoint: `https://${adapter}.registry.demo.invalid?token=never-copy`,
    namespace: "",
    nacosApiVersion: "v2",
    environment,
    auth: { mode: "none", username: "", customKey: "" },
    tls: {
      enabled: false,
      caCertificatePath: "",
      clientCertificatePath: "",
      clientKeyPath: "",
      serverName: "",
    },
  };
}

function etcdDocument() {
  return document(
    { type: "etcd", keyBase64: "L3NlcnZpY2VzL3BheW1lbnRz" },
    "42",
  );
}

function zookeeperDocument() {
  return document({ type: "zookeeper", path: "/services/payments" }, "7");
}

function nacosDocument() {
  return document(
    { type: "nacosConfig", group: "PAYMENTS", dataId: "payments.yaml" },
    "md5-old",
  );
}

function document(address, version) {
  return {
    address,
    name: "payments",
    value: {
      content: "service=payments\ntimeout=1000",
      encoding: "utf8",
      sizeBytes: 29,
    },
    contentType: "properties",
    version,
    metadata: {},
  };
}

function mutationResult(address, version) {
  return {
    operation: "update",
    address,
    previous: {
      version: "md5-old",
      sha256: "previous-hash",
      sizeBytes: 29,
      encoding: "utf8",
      value: "password=unexpected-extra-field",
    },
    current: {
      version,
      sha256: "current-hash",
      sizeBytes: 47,
      encoding: "utf8",
      rawValue: "access_token=unexpected-extra-field",
    },
    consistency: "atomic",
  };
}

function registryError(code) {
  return { code, message: `${code} sentinel`, retryable: false };
}

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function dataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
