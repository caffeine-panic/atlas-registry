import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const planSource = await readFile(
  new URL("../src/sshCredentialPlan.ts", import.meta.url),
  "utf8",
);
const { planSshCredential } = await import(
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(planSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText).toString("base64")}`
);

test("SSH credential edits never reuse a password as a new key passphrase", () => {
  const password = {
    id: "a",
    sshTunnel: {
      enabled: true,
      authentication: "password",
      privateKeyPath: "",
    },
  };
  const key = {
    id: "a",
    sshTunnel: {
      enabled: true,
      authentication: "privateKey",
      privateKeyPath: "/key",
    },
  };
  assert.deepEqual(planSshCredential(password, undefined, ""), {
    missingPassword: true,
    update: { operation: "clear" },
    transient: "",
  });
  assert.deepEqual(planSshCredential(password, password, ""), {
    missingPassword: false,
    update: { operation: "preserve" },
    transient: undefined,
  });
  assert.deepEqual(planSshCredential(key, password, ""), {
    missingPassword: false,
    update: { operation: "clear" },
    transient: "",
  });
  assert.equal(
    planSshCredential(
      { ...key, sshTunnel: { ...key.sshTunnel, privateKeyPath: "/new-key" } },
      key,
      "",
    ).transient,
    "",
  );
  assert.equal(planSshCredential(key, key, "").update.operation, "preserve");
  assert.equal(
    planSshCredential({ ...password, id: "copy" }, password, "")
      .missingPassword,
    true,
  );
  assert.deepEqual(planSshCredential(key, password, "new-passphrase").update, {
    operation: "replace",
    secret: "new-passphrase",
  });
  assert.equal(
    planSshCredential(
      { ...key, sshTunnel: { ...key.sshTunnel, enabled: false } },
      key,
      "ignored",
    ).update.operation,
    "clear",
  );
});

const [appSource, dialogSource, registrySource] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/ConnectionDialog.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/registry.ts", import.meta.url), "utf8"),
]);

test("the etcd connection form exposes an opt-in pinned SSH tunnel", () => {
  assert.match(dialogSource, /form\.adapter === "etcd"/);
  assert.match(dialogSource, /form\.sshTunnel\.enabled/);
  assert.match(dialogSource, /hostKeyFingerprint/);
  assert.match(dialogSource, /authentication: event\.target\s*\.value/);
});

test("SSH credentials use a separate one-shot IPC field and vault update", () => {
  assert.match(registrySource, /sshCredentialUpdate/);
  assert.match(registrySource, /sshSecret: sshSecret \?\? null/);
  assert.match(appSource, /setSshSecret/);
  assert.match(appSource, /sshCredentialUpdate/);
  assert.doesNotMatch(appSource, /localStorage[^\n]*sshSecret/i);
});
