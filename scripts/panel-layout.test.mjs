import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/panelLayout.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const panelLayout = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);

test("connections and resources can be collapsed independently", () => {
  const connectionsCollapsed = panelLayout.togglePanel(
    panelLayout.DEFAULT_PANEL_LAYOUT,
    "connections",
  );
  assert.deepEqual(connectionsCollapsed, {
    connections: "collapsed",
    resources: "expanded",
    widths: panelLayout.DEFAULT_PANEL_LAYOUT.widths,
  });

  assert.deepEqual(panelLayout.togglePanel(connectionsCollapsed, "resources"), {
    connections: "collapsed",
    resources: "collapsed",
    widths: panelLayout.DEFAULT_PANEL_LAYOUT.widths,
  });
});

test("the last valid panel layout is restored on startup", () => {
  const storage = {
    getItem: () =>
      JSON.stringify({
        version: 1,
        layout: {
          connections: "collapsed",
          resources: "expanded",
        },
      }),
  };

  assert.deepEqual(panelLayout.loadPanelLayout(storage), {
    connections: "collapsed",
    resources: "expanded",
    widths: panelLayout.DEFAULT_PANEL_LAYOUT.widths,
  });
});

test("panel layout changes are persisted without application data", () => {
  let savedKey;
  let savedValue;
  const storage = {
    setItem: (key, value) => {
      savedKey = key;
      savedValue = value;
    },
  };
  const layout = panelLayout.togglePanel(
    panelLayout.DEFAULT_PANEL_LAYOUT,
    "resources",
  );

  assert.deepEqual(panelLayout.savePanelLayout(layout, storage), layout);
  assert.equal(savedKey, "atlas.panelLayout");
  assert.deepEqual(JSON.parse(savedValue), {
    version: 2,
    layout,
  });
});

test("invalid or unavailable storage falls back to both panels expanded", () => {
  assert.deepEqual(
    panelLayout.loadPanelLayout({
      getItem: () =>
        JSON.stringify({
          version: 1,
          layout: {
            connections: "hidden",
            resources: "collapsed",
          },
        }),
    }),
    panelLayout.DEFAULT_PANEL_LAYOUT,
  );
  assert.deepEqual(
    panelLayout.loadPanelLayout({
      getItem: () => {
        throw new Error("storage unavailable");
      },
    }),
    panelLayout.DEFAULT_PANEL_LAYOUT,
  );
});

test("expanded navigation panels can be resized continuously within the usable window", () => {
  const widened = panelLayout.resizePanel(
    panelLayout.DEFAULT_PANEL_LAYOUT,
    "resources",
    246,
    1_400,
  );

  assert.equal(widened.widths.resources, 576);
  assert.equal(
    panelLayout.resizePanel(widened, "resources", -10_000, 1_400).widths
      .resources,
    panelLayout.PANEL_WIDTH_LIMITS.resources.min,
  );
  assert.equal(
    panelLayout.resizePanel(widened, "resources", 10_000, 1_400).widths
      .resources,
    790,
    "the detail workspace keeps its minimum width while the resource panel uses the remaining space",
  );
});

test("resized panel widths are persisted and old visibility-only layouts migrate", () => {
  const migrated = panelLayout.loadPanelLayout({
    getItem: () =>
      JSON.stringify({
        version: 1,
        layout: {
          connections: "collapsed",
          resources: "expanded",
        },
      }),
  });

  assert.deepEqual(migrated, {
    connections: "collapsed",
    resources: "expanded",
    widths: panelLayout.DEFAULT_PANEL_LAYOUT.widths,
  });
});
