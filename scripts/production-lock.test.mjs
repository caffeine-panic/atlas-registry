import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/productionLock.ts", import.meta.url),
  "utf8",
);
const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const bannerSource = readFileSync(
  new URL("../src/ProductionLockBanner.tsx", import.meta.url),
  "utf8",
);
const i18nSource = readFileSync(
  new URL("../src/i18n.ts", import.meta.url),
  "utf8",
);
const registryRustSource = readFileSync(
  new URL("../src-tauri/src/registry.rs", import.meta.url),
  "utf8",
);
const auditedMutationSource = readFileSync(
  new URL("../src-tauri/src/audited_mutation.rs", import.meta.url),
  "utf8",
);
const productionLock = await import(
  `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext },
    }).outputText,
  ).toString("base64")}`
);

test("production writes fail closed until a live bounded window exists", () => {
  assert.equal(
    productionLock.productionWriteAllowed(false, undefined, 100),
    true,
  );
  assert.equal(
    productionLock.productionWriteAllowed(true, undefined, 100),
    false,
  );
  assert.equal(
    productionLock.productionWriteAllowed(
      true,
      status({ locked: true, unlockedUntilMs: null }),
      100,
    ),
    false,
  );
  assert.equal(
    productionLock.productionWriteAllowed(
      true,
      status({ locked: false, unlockedUntilMs: 101 }),
      100,
    ),
    true,
  );
});

test("expiry immediately converts an unlocked status back to locked", () => {
  const active = productionLock.effectiveProductionLock(
    status({ locked: false, unlockedUntilMs: 61_000 }),
    1_000,
  );
  assert.equal(active.locked, false);
  assert.equal(active.remainingSeconds, 60);

  const expired = productionLock.effectiveProductionLock(
    status({ locked: false, unlockedUntilMs: 61_000 }),
    61_000,
  );
  assert.equal(expired.locked, true);
  assert.equal(expired.unlockedUntilMs, null);
  assert.equal(expired.remainingSeconds, null);
});

test("the UI exposes an audited session-only lock and closes pending writes", () => {
  assert.match(appSource, /getProductionLockStatus\(selectedSessionId\)/);
  assert.match(appSource, /if \(writeAllowed\) return;/);
  assert.match(appSource, /setPendingMutation\(undefined\)/);
  assert.match(appSource, /setEtcdTransactionOpen\(false\)/);
  assert.match(bannerSource, /t\("production\.unlockHelp"\)/);
  assert.match(i18nSource, /不写入连接配置/);
  assert.match(bannerSource, /confirmation !== profile\.name/);
  assert.match(bannerSource, /\[300, 900, 1_800, 3_600\]/);
});

test("generic and protocol-native dispatch paths share the production gate", () => {
  const methods = [
    "mutate_with_phase",
    "execute_etcd_transaction_with_phase",
    "execute_etcd_lease_action_with_phase",
    "execute_zookeeper_native_action_with_phase",
    "execute_nacos_native_action_with_phase",
  ];
  for (const method of methods) {
    assert.match(
      registryRustSource,
      new RegExp(
        `fn ${method}[\\s\\S]{0,500}ensure_mutation_allowed\\(connection_id\\)`,
      ),
      `${method} must fail closed immediately before dispatch`,
    );
  }
  assert.match(
    auditedMutationSource,
    /ensure_mutation_allowed\(connection_id\)[\s\S]{0,400}run_mutation_workflow/,
  );
});

function status(overrides) {
  return {
    connectionId: "prod-1",
    production: true,
    locked: true,
    unlockedUntilMs: null,
    remainingSeconds: null,
    ...overrides,
  };
}
