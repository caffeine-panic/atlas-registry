import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const paging = await import("../src/nacosPaging.ts");
const adaptersSource = await readFile(
  new URL("../src-tauri/src/registry/adapters.rs", import.meta.url),
  "utf8",
);

test("Nacos numbered pages use stable server cursors and clamp remote shrinkage", () => {
  assert.equal(paging.nacosPageCursor(1), undefined);
  assert.equal(paging.nacosPageCursor(7), "7");
  assert.equal(paging.clampNacosPage(5, 4), 4);
  assert.equal(paging.clampNacosPage(1, 0), 1);
});

test("starting a new forward search discards stale cached pages after the current page", () => {
  const duplicate = {
    address: { type: "nacosConfig", group: "trip", dataId: "trip-service" },
    name: "trip / trip-service",
    readable: true,
    hasChildren: false,
  };
  const pages = paging.appendDedupedSearchPage(
    [
      {
        scope: { type: "root" },
        items: [duplicate],
        matches: [{ address: duplicate.address, fields: ["dataId"] }],
        nextCursor: "next",
        scanned: 1,
        exhaustive: false,
      },
      {
        scope: { type: "root" },
        items: [],
        scanned: 0,
        exhaustive: true,
      },
    ],
    0,
    {
      scope: { type: "root" },
      items: [
        duplicate,
        {
          ...duplicate,
          address: { ...duplicate.address, dataId: "payments" },
          name: "trip / payments",
        },
      ],
      matches: [
        { address: duplicate.address, fields: ["group"] },
        {
          address: { ...duplicate.address, dataId: "payments" },
          fields: ["group"],
        },
      ],
      scanned: 2,
      exhaustive: true,
    },
  );
  assert.equal(pages.length, 2);
  assert.equal(pages[1].items.length, 1);
  assert.deepEqual(pages[0].matches[0].fields, ["dataId", "group"]);
});

test("Nacos v2 and v3 group searches sign the group sent to MSE", () => {
  const v2 = adaptersSource.match(
    /async fn fetch_nacos_v2_page[\s\S]*?\n}\n\nfn json_value_kind/,
  )?.[0];
  const v3 = adaptersSource.match(
    /async fn fetch_nacos_v3_page[\s\S]*?\n}\n\nasync fn read_nacos/,
  )?.[0];
  for (const source of [v2, v3]) {
    assert.ok(source, "Nacos page request implementation should be present");
    assert.match(
      source,
      /\.apply_for_config\(\s*session\.http\.get\(url\),\s*public_namespace_for_sdk\(&session\.namespace\),\s*group,?\s*\)/,
    );
  }
});
