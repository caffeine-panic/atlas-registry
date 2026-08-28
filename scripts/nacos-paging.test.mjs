import assert from "node:assert/strict";
import test from "node:test";

const paging = await import("../src/nacosPaging.ts");

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
