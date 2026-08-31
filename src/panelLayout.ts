export type PanelId = "connections" | "resources";
export type PanelVisibility = "expanded" | "collapsed";
export type PanelWidths = Record<PanelId, number>;
export type PanelLayout = Record<PanelId, PanelVisibility> & {
  widths: PanelWidths;
};

export const PANEL_WIDTH_LIMITS: Record<
  PanelId,
  { min: number; default: number }
> = {
  connections: { min: 180, default: 250 },
  resources: { min: 240, default: 330 },
};

export const COLLAPSED_PANEL_WIDTH = 42;
export const MIN_WORKSPACE_WIDTH = 360;
const MAX_STORED_PANEL_WIDTH = 1_600;

export const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  connections: "expanded",
  resources: "expanded",
  widths: {
    connections: PANEL_WIDTH_LIMITS.connections.default,
    resources: PANEL_WIDTH_LIMITS.resources.default,
  },
};

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

const STORAGE_KEY = "atlas.panelLayout";

function isPanelVisibility(value: unknown): value is PanelVisibility {
  return value === "expanded" || value === "collapsed";
}

function defaultPanelLayout(): PanelLayout {
  return {
    ...DEFAULT_PANEL_LAYOUT,
    widths: { ...DEFAULT_PANEL_LAYOUT.widths },
  };
}

function storedPanelWidth(panel: PanelId, value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return PANEL_WIDTH_LIMITS[panel].default;
  }
  return Math.min(
    MAX_STORED_PANEL_WIDTH,
    Math.max(PANEL_WIDTH_LIMITS[panel].min, value),
  );
}

export function loadPanelLayout(
  storage: ReadableStorage = globalThis.localStorage,
): PanelLayout {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultPanelLayout();
    const saved = JSON.parse(raw) as {
      version?: unknown;
      layout?: Partial<PanelLayout> & { widths?: Partial<PanelWidths> };
    };
    if (
      (saved.version === 1 || saved.version === 2) &&
      isPanelVisibility(saved.layout?.connections) &&
      isPanelVisibility(saved.layout.resources)
    ) {
      return {
        connections: saved.layout.connections,
        resources: saved.layout.resources,
        widths: {
          connections: storedPanelWidth(
            "connections",
            saved.layout.widths?.connections,
          ),
          resources: storedPanelWidth(
            "resources",
            saved.layout.widths?.resources,
          ),
        },
      };
    }
  } catch {
    // 损坏或不可用的 WebView 存储不应阻止应用启动。
  }
  return defaultPanelLayout();
}

export function savePanelLayout(
  layout: PanelLayout,
  storage: WritableStorage = globalThis.localStorage,
): PanelLayout {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        layout,
      }),
    );
  } catch {
    // 布局仍在当前会话生效；存储失败不应中断用户操作。
  }
  return layout;
}

export function togglePanel(layout: PanelLayout, panel: PanelId): PanelLayout {
  return {
    ...layout,
    [panel]: layout[panel] === "expanded" ? "collapsed" : "expanded",
  };
}

export function resizePanel(
  layout: PanelLayout,
  panel: PanelId,
  delta: number,
  availableWidth: number,
): PanelLayout {
  if (layout[panel] === "collapsed") return layout;

  const otherPanel = panel === "connections" ? "resources" : "connections";
  const otherWidth =
    layout[otherPanel] === "collapsed"
      ? COLLAPSED_PANEL_WIDTH
      : layout.widths[otherPanel];
  const minimum = PANEL_WIDTH_LIMITS[panel].min;
  const maximum = Math.max(
    minimum,
    availableWidth - MIN_WORKSPACE_WIDTH - otherWidth,
  );
  const width = Math.min(
    maximum,
    Math.max(minimum, layout.widths[panel] + delta),
  );

  if (width === layout.widths[panel]) return layout;
  return {
    ...layout,
    widths: {
      ...layout.widths,
      [panel]: width,
    },
  };
}
