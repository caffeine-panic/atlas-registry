import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/resourceCompare.ts", import.meta.url),
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
  new URL("../src/ResourceCompareDialog.tsx", import.meta.url),
  "utf8",
);
const registryErrorUrl = dataUrl(transpile(registryErrorSource));
const comparisonOutput = transpile(source).replace(
  'from "./registryError"',
  `from "${registryErrorUrl}"`,
);
const comparison = await import(dataUrl(comparisonOutput));

test("compatible sources require another open connection using the same protocol", () => {
  for (const adapter of ["etcd", "zookeeper", "nacos"]) {
    const target = profile(`target-${adapter}`, adapter);
    const same = profile(`source-${adapter}`, adapter);
    const other = profile(
      `other-${adapter}`,
      adapter === "etcd" ? "nacos" : "etcd",
    );
    assert.deepEqual(
      comparison
        .compatibleSourceProfiles(
          [target, same, other],
          new Set([same.id, other.id]),
          target,
        )
        .map((item) => item.id),
      [same.id],
    );
  }
});

test("protocol identity accepts only exact resource kinds", () => {
  assert.equal(comparison.addressMatchesAdapter("etcd", etcdAddress()), true);
  assert.equal(
    comparison.addressMatchesAdapter("zookeeper", {
      type: "zookeeper",
      path: "/atlas",
    }),
    true,
  );
  assert.equal(
    comparison.addressMatchesAdapter("nacos", {
      type: "nacosConfig",
      group: "DEFAULT_GROUP",
      dataId: "atlas.yaml",
    }),
    true,
  );
  assert.equal(
    comparison.addressMatchesAdapter("etcd", { type: "root" }),
    false,
  );
  assert.equal(
    comparison.addressMatchesAdapter("etcd", {
      type: "zookeeper",
      path: "/atlas",
    }),
    false,
  );
});

test("text and binary comparisons distinguish equality without decoding loss", () => {
  const target = document("target", "utf8", "hello", "1");
  assert.equal(
    comparison.compareResourceDocuments(
      document("source", "utf8", "hello", "8"),
      target,
    ).kind,
    "equal",
  );
  assert.equal(
    comparison.compareResourceDocuments(
      document("source", "utf8", "changed", "8"),
      target,
    ).kind,
    "different",
  );

  const binary = comparison.compareResourceDocuments(
    document("source", "base64", "aGVsbG8=", "8"),
    target,
  );
  assert.equal(binary.kind, "binary");
  assert.equal(binary.equality, "equal");
});

test("missing, oversized, unauthorized, and cancellation remain distinct", () => {
  const errors = [
    ["notFound", "missing"],
    ["valueTooLarge", "oversized"],
    ["permissionDenied", "unauthorized"],
    ["cancelled", "cancelled"],
  ];
  for (const [code, kind] of errors) {
    assert.equal(
      comparison.classifyComparisonError(
        { code, message: "sentinel", retryable: false },
        "source",
      ).kind,
      kind,
    );
  }
});

test("promotion refuses a target that changed after comparison", () => {
  const sourceDocument = document("source", "utf8", "promote-me", "7");
  const targetDocument = document("target", "utf8", "old", "11");
  const compared = comparison.compareResourceDocuments(
    sourceDocument,
    targetDocument,
  );
  const stale = comparison.staleComparison(
    compared,
    sourceDocument,
    document("target", "utf8", "someone-else", "12"),
  );
  assert.equal(stale.kind, "stale");
  assert.equal(stale.side, "target");
  assert.equal(stale.comparedVersion, "11");
  assert.equal(stale.currentVersion, "12");
});

test("comparison stays bounded and promotion reuses the guarded workflow", () => {
  assert.match(dialogSource, /仅对两个精确地址各读取一次，不扫描目录/);
  assert.match(dialogSource, /来源/);
  assert.match(dialogSource, /目标/);
  assert.match(appSource, /staleComparison\(/);
  assert.match(appSource, /createSafeChangePlanFromValue\(/);
  assert.match(appSource, /initialSafeChangeState\(/);
  assert.doesNotMatch(
    source,
    /console\.|localStorage|sessionStorage|URLSearchParams|indexedDB/,
  );
});

function profile(id, adapter) {
  return {
    id,
    name: id,
    adapter,
    endpoint: `${id}.example:1234`,
    namespace: "",
    nacosApiVersion: "v2",
    environment: id.startsWith("target") ? "production" : "staging",
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

function document(name, encoding, content, version) {
  return {
    address: etcdAddress(),
    name,
    value: {
      content,
      encoding,
      sizeBytes: encoding === "base64" ? atob(content).length : content.length,
    },
    version,
    metadata: {},
  };
}

function etcdAddress() {
  return { type: "etcd", keyBase64: "L2F0bGFzL2NvbmZpZw==" };
}

function transpile(value) {
  return ts.transpileModule(value, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText;
}

function dataUrl(value) {
  return `data:text/javascript;base64,${Buffer.from(value).toString("base64")}`;
}
