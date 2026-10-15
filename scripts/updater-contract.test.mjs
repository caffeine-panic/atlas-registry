import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop updater is signed and served by the repository release channel", () => {
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  const updater = config.plugins?.updater;

  assert.equal(config.bundle?.createUpdaterArtifacts, true);
  assert.deepEqual(updater?.endpoints, [
    "https://github.com/caffeine-panic/atlas-registry/releases/latest/download/latest.json",
  ]);
  assert.ok(
    typeof updater?.pubkey === "string" &&
      updater.pubkey.length > 80 &&
      !updater.pubkey.includes("PLACEHOLDER"),
    "a real updater public key must be embedded in the application",
  );
});

test("desktop quality and releases target Apple Silicon macOS only", () => {
  const quality = parse(read(".github/workflows/quality.yml"));
  const release = parse(read(".github/workflows/release.yml"));
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));

  assert.deepEqual(Object.keys(quality.jobs), ["desktop"]);
  assert.deepEqual(Object.keys(release.jobs), ["bundles"]);
  for (const job of [quality.jobs.desktop, release.jobs.bundles]) {
    assert.match(job["runs-on"], /^macos-/);
    assert.equal(
      job.strategy,
      undefined,
      "desktop platform matrices are retired",
    );
    const architecture = job.steps.find(
      (step) => step.name === "Verify Apple Silicon runner",
    );
    assert.match(
      architecture?.run ?? "",
      /test\s+"\$\(uname\s+-m\)"\s*=\s*arm64/,
    );
    const rust = job.steps.find((step) =>
      step.uses?.startsWith("dtolnay/rust-toolchain@"),
    );
    assert.equal(rust?.with?.targets, "aarch64-apple-darwin");
  }

  const action = release.jobs.bundles.steps.find((step) =>
    step.uses?.startsWith("tauri-apps/tauri-action@"),
  );
  assert.equal(
    action?.with?.args,
    "--target aarch64-apple-darwin --bundles app,dmg",
  );
  const build = quality.jobs.desktop.steps.find(
    (step) => step.name === "Build macOS install bundles",
  );
  assert.match(
    build?.run ?? "",
    /--target\s+aarch64-apple-darwin\s+--bundles\s+app,dmg/,
  );
  const verification = quality.jobs.desktop.steps.find(
    (step) => step.name === "Verify and install macOS bundles",
  );
  assert.match(verification?.run ?? "", /lipo\s+-archs/);
  assert.match(verification?.run ?? "", /=\s*arm64/);
  assert.deepEqual(config.bundle?.targets, ["app", "dmg"]);
});

test("release workflow requires the private updater key without committing it", () => {
  const workflow = read(".github/workflows/release.yml");
  const qualityWorkflow = read(".github/workflows/quality.yml");
  const ignore = read(".gitignore");

  assert.match(
    workflow,
    /TAURI_SIGNING_PRIVATE_KEY:\s*\$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY \}\}/,
  );
  assert.match(
    workflow,
    /TAURI_SIGNING_PRIVATE_KEY_PASSWORD:\s*\$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY_PASSWORD \}\}/,
  );
  assert.match(workflow, /test -n "\$TAURI_SIGNING_PRIVATE_KEY"/);
  assert.match(workflow, /test -n "\$TAURI_SIGNING_PRIVATE_KEY_PASSWORD"/);
  assert.match(workflow, /name: Configure macOS signing/);
  assert.match(workflow, /if \[ -z "\$APPLE_CERTIFICATE" \]; then/);
  assert.match(workflow, /APPLE_SIGNING_IDENTITY=-/);
  assert.match(workflow, /includeUpdaterJson:\s*true/);
  assert.doesNotMatch(workflow, /uploadUpdaterJson|uploadUpdaterSignatures/);

  const jobEnvironment = parse(workflow).jobs.bundles.env;
  assert.ok(
    Object.keys(jobEnvironment).every((key) => !key.startsWith("APPLE_")),
  );

  const actionStep = workflow.slice(
    workflow.indexOf("- uses: tauri-apps/tauri-action"),
  );
  assert.doesNotMatch(
    actionStep,
    /APPLE_CERTIFICATE|APPLE_ID:|APPLE_PASSWORD:|APPLE_TEAM_ID:/,
  );
  assert.match(qualityWorkflow, /"createUpdaterArtifacts":false/g);
  assert.match(ignore, /^\.codex\/$/m);
  assert.match(ignore, /^\*\.key$/m);
});

test("update operations stay behind the audited Rust command surface", () => {
  const backend = read("src-tauri/src/lib.rs");
  const build = read("src-tauri/build.rs");
  const frontend = read("src/registry.ts");
  const capability = JSON.parse(read("src-tauri/capabilities/default.json"));

  assert.match(backend, /tauri_plugin_updater::Builder::new\(\)\.build\(\)/);
  assert.match(backend, /check_for_app_update/);
  assert.match(backend, /install_app_update/);
  assert.match(build, /"check_for_app_update"/);
  assert.match(build, /"install_app_update"/);
  assert.match(
    frontend,
    /invoke<AppUpdateInfo \| null>\("check_for_app_update"/,
  );
  assert.match(frontend, /invoke<void>\("install_app_update"/);
  assert.ok(capability.permissions.includes("allow-check-for-app-update"));
  assert.ok(capability.permissions.includes("allow-install-app-update"));
  assert.ok(!capability.permissions.includes("updater:default"));
});

test("update checks and downloads share the user-selected proxy policy", () => {
  const manifest = read("src-tauri/Cargo.toml");
  const backend = read("src-tauri/src/updates.rs");
  const frontend = read("src/registry.ts");

  assert.match(
    manifest,
    /reqwest[^\n]*version\s*=\s*"0\.13"[^\n]*"system-proxy"/,
  );
  assert.match(backend, /UpdateProxySettings/);
  assert.match(backend, /\.proxy\(proxy\)/);
  assert.match(backend, /\.no_proxy\(\)/);
  assert.match(
    frontend,
    /invoke<AppUpdateInfo \| null>\("check_for_app_update", \{\s*proxySettings,?\s*\}\)/,
  );
});
