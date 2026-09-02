import type {
  AdapterDescriptor,
  ConnectionProfile,
  ConnectionSession,
  NativeResourceInfo,
  ResourceAddress,
  ResourceDocument,
  ResourceNode,
  ResourcePage,
  ResourceSearchField,
  ResourceSearchPage,
} from "./registry";

export type WorkspaceMode = "live" | "demo";

export type WorkspaceBootstrap = {
  capabilities: AdapterDescriptor[];
  profiles: ConnectionProfile[];
  sessions: Record<string, ConnectionSession>;
  selectedId?: string;
  rootPage?: ResourcePage;
  document?: ResourceDocument;
};

export type WorkspaceSource = {
  kind: WorkspaceMode;
  bootstrap: () => Promise<WorkspaceBootstrap>;
  openConnection: (
    profile: ConnectionProfile,
    operationId: string,
    transientSecret?: string,
  ) => Promise<ConnectionSession>;
  closeConnection: (connectionId: string) => Promise<void>;
  cancelOperation: (operationId: string) => Promise<boolean>;
  listResources: (
    connectionId: string,
    parent: ResourceAddress,
    operationId: string,
    cursor?: string,
  ) => Promise<ResourcePage>;
  readResource: (
    connectionId: string,
    address: ResourceAddress,
    operationId: string,
  ) => Promise<ResourceDocument>;
  searchResources: (
    connectionId: string,
    scope: ResourceAddress,
    query: string,
    operationId: string,
    cursor?: string,
  ) => Promise<ResourceSearchPage>;
  inspectNativeResource: (
    connectionId: string,
    address: ResourceAddress,
    operationId: string,
  ) => Promise<NativeResourceInfo>;
};

const ROOT_ADDRESS: ResourceAddress = { type: "root" };
const DEMO_PAGE_SIZE = 3;
const DEMO_SEARCH_PAGE_SIZE = 2;

const emptyTls = {
  enabled: false,
  caCertificatePath: "",
  clientCertificatePath: "",
  clientKeyPath: "",
  serverName: "",
};

export const DEMO_PROFILES: ConnectionProfile[] = [
  {
    id: "demo-etcd",
    name: "Payments · Production",
    adapter: "etcd",
    endpoint: "etcd.demo.invalid:2379",
    namespace: "",
    nacosApiVersion: "v2",
    environment: "production",
    auth: { mode: "none", username: "", customKey: "" },
    tls: emptyTls,
  },
  {
    id: "demo-zookeeper",
    name: "Orders · Staging",
    adapter: "zookeeper",
    endpoint: "zookeeper.demo.invalid:2181",
    namespace: "",
    nacosApiVersion: "v2",
    environment: "staging",
    auth: { mode: "none", username: "", customKey: "" },
    tls: emptyTls,
  },
  {
    id: "demo-nacos",
    name: "Checkout · Development",
    adapter: "nacos",
    endpoint: "https://nacos.demo.invalid",
    namespace: "checkout-dev",
    nacosApiVersion: "v3",
    environment: "development",
    auth: { mode: "none", username: "", customKey: "" },
    tls: emptyTls,
  },
];

export const DEMO_CAPABILITIES: AdapterDescriptor[] = [
  {
    id: "etcd",
    status: "available",
    capabilities: [
      "probe",
      "browse",
      "search",
      "read",
      "watch",
      "create",
      "update",
      "delete",
      "lease",
      "transaction",
    ],
  },
  {
    id: "zookeeper",
    status: "available",
    capabilities: [
      "probe",
      "browse",
      "search",
      "read",
      "watch",
      "create",
      "update",
      "delete",
      "acl",
      "ephemeral",
    ],
  },
  {
    id: "nacos",
    status: "available",
    capabilities: [
      "probe",
      "browse",
      "search",
      "read",
      "watch",
      "create",
      "update",
      "delete",
      "history",
      "namespace",
      "service",
      "instance",
    ],
  },
];

type DemoEntry = {
  connectionId: string;
  parent: ResourceAddress;
  node: ResourceNode;
  document?: ResourceDocument;
  nativeInfo?: NativeResourceInfo;
  readError?: string;
};

const entries: DemoEntry[] = [
  etcdEntry(
    ROOT_ADDRESS,
    "/production/payments/config.yaml",
    "cHJvZHVjdGlvbi9wYXltZW50cy9jb25maWcueWFtbA==",
    `service: payments-api
region: us-east-1
timeout_ms: 1800
retries: 3
features:
  idempotency: true
  fraud_checks: strict`,
    "18446744073709551002",
    "827364911",
  ),
  {
    connectionId: "demo-etcd",
    parent: ROOT_ADDRESS,
    node: {
      address: { type: "etcdPrefix", prefixBase64: "c2VydmljZXMv" },
      name: "/services/",
      readable: false,
      hasChildren: true,
    },
  },
  {
    connectionId: "demo-etcd",
    parent: ROOT_ADDRESS,
    node: {
      address: { type: "etcdPrefix", prefixBase64: "YXJjaGl2ZS8=" },
      name: "/archive/",
      readable: false,
      hasChildren: true,
    },
  },
  {
    connectionId: "demo-etcd",
    parent: ROOT_ADDRESS,
    node: {
      address: {
        type: "etcd",
        keyBase64: "ZGVtby91bmF2YWlsYWJsZQ==",
      },
      name: "/demo/unavailable",
      readable: true,
      hasChildren: false,
    },
    readError: "演示错误：当前资源暂时不可读取",
  },
  etcdEntry(
    { type: "etcdPrefix", prefixBase64: "c2VydmljZXMv" },
    "/services/checkout/url",
    "c2VydmljZXMvY2hlY2tvdXQvdXJs",
    "https://checkout.demo.invalid",
    "18446744073709551008",
  ),
  etcdEntry(
    { type: "etcdPrefix", prefixBase64: "c2VydmljZXMv" },
    "/services/checkout/timeout",
    "c2VydmljZXMvY2hlY2tvdXQvdGltZW91dA==",
    "1800",
    "18446744073709551009",
  ),
  zookeeperEntry(
    ROOT_ADDRESS,
    "/leader",
    `{"instance":"orders-2","term":42,"region":"eu-west-1"}`,
    "19",
    {
      kind: "zookeeperAcl",
      address: { type: "zookeeper", path: "/leader" },
      aclVersion: 4,
      entries: [
        { scheme: "world", id: "anyone", permissions: ["read"] },
        {
          scheme: "auth",
          id: "",
          permissions: ["read", "write", "admin"],
        },
      ],
    },
  ),
  {
    connectionId: "demo-zookeeper",
    parent: ROOT_ADDRESS,
    node: {
      address: { type: "zookeeper", path: "/services" },
      name: "/services",
      readable: false,
      hasChildren: true,
    },
  },
  {
    connectionId: "demo-zookeeper",
    parent: ROOT_ADDRESS,
    node: {
      address: { type: "zookeeper", path: "/empty" },
      name: "/empty",
      readable: false,
      hasChildren: true,
    },
  },
  {
    connectionId: "demo-zookeeper",
    parent: ROOT_ADDRESS,
    node: {
      address: { type: "zookeeper", path: "/demo-error" },
      name: "/demo-error",
      readable: true,
      hasChildren: false,
    },
    readError: "演示错误：ZooKeeper 会话已过期",
  },
  zookeeperEntry(
    { type: "zookeeper", path: "/services" },
    "/services/orders-api",
    `{"host":"orders.demo.invalid","port":8443}`,
    "8",
  ),
  zookeeperEntry(
    { type: "zookeeper", path: "/services" },
    "/services/inventory-api",
    `{"host":"inventory.demo.invalid","port":8443}`,
    "5",
  ),
  nacosEntry(
    "PAYMENTS",
    "checkout-api.yaml",
    `server:
  port: 8080
payment:
  provider: sandbox
  currency: USD
  timeout_ms: 1800`,
    "8f7e2a6d4b091c35",
  ),
  nacosEntry(
    "PAYMENTS",
    "fraud-rules.json",
    `{"mode":"strict","scoreThreshold":72,"manualReview":true}`,
    "19f4e20cb8d6a713",
  ),
  nacosEntry(
    "PLATFORM",
    "gateway.properties",
    "rate.limit=240\ncircuit.breaker=true\ntrace.sample=0.10",
    "3ed42a8a70c41f20",
  ),
  nacosEntry(
    "OBSERVABILITY",
    "telemetry.yaml",
    "exporter: otlp\nsampling: 0.10\nmetrics: enabled",
    "57dc0a8fcd33e112",
  ),
];

function etcdEntry(
  parent: ResourceAddress,
  name: string,
  keyBase64: string,
  content: string,
  version: string,
  lease = "0",
): DemoEntry {
  const address = { type: "etcd" as const, keyBase64 };
  return {
    connectionId: "demo-etcd",
    parent,
    node: { address, name, readable: true, hasChildren: false },
    document: {
      address,
      name,
      value: { content, encoding: "utf8", sizeBytes: byteLength(content) },
      contentType: name.endsWith(".yaml") ? "yaml" : "text",
      version,
      metadata: {
        createRevision: "18446744073709550001",
        modRevision: version,
        lease,
      },
    },
    nativeInfo:
      lease === "0"
        ? undefined
        : {
            kind: "etcdLease",
            address,
            leaseId: lease,
            remainingTtlSeconds: 248,
            grantedTtlSeconds: 300,
          },
  };
}

function zookeeperEntry(
  parent: ResourceAddress,
  path: string,
  content: string,
  version: string,
  nativeInfo?: NativeResourceInfo,
): DemoEntry {
  const address = { type: "zookeeper" as const, path };
  return {
    connectionId: "demo-zookeeper",
    parent,
    node: { address, name: path, readable: true, hasChildren: false },
    document: {
      address,
      name: path,
      value: { content, encoding: "utf8", sizeBytes: byteLength(content) },
      contentType: "json",
      version,
      metadata: {
        ephemeralOwner: path === "/leader" ? "0x7f2a9c01" : "0",
        dataVersion: version,
        aclVersion: "4",
      },
    },
    nativeInfo,
  };
}

function nacosEntry(
  group: string,
  dataId: string,
  content: string,
  version: string,
): DemoEntry {
  const address = { type: "nacosConfig" as const, group, dataId };
  return {
    connectionId: "demo-nacos",
    parent: ROOT_ADDRESS,
    node: {
      address,
      name: `${group} / ${dataId}`,
      readable: true,
      hasChildren: false,
    },
    document: {
      address,
      name: dataId,
      value: { content, encoding: "utf8", sizeBytes: byteLength(content) },
      contentType: dataId.split(".").at(-1),
      version,
      metadata: {
        namespace: "checkout-dev",
        group,
        md5: version,
        service: "checkout-api",
        healthyInstances: "3 / 3",
      },
    },
  };
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function addressKey(address: ResourceAddress) {
  return JSON.stringify(address);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sessionFor(connectionId: string): ConnectionSession {
  const profile = DEMO_PROFILES.find((item) => item.id === connectionId);
  if (!profile) throw new Error("演示连接不存在");
  return {
    id: profile.id,
    name: profile.name,
    adapter: profile.adapter,
    endpoint: profile.endpoint,
  };
}

function childEntries(connectionId: string, parent: ResourceAddress) {
  const key = addressKey(parent);
  return entries.filter(
    (entry) =>
      entry.connectionId === connectionId && addressKey(entry.parent) === key,
  );
}

function parseOffset(cursor: string | undefined, maximum: number) {
  if (cursor === undefined) return 0;
  if (!/^\d+$/.test(cursor)) throw new Error("演示分页游标无效");
  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > maximum)
    throw new Error("演示分页游标超出范围");
  return offset;
}

function searchFields(
  node: ResourceNode,
  query: string,
): ResourceSearchField[] {
  if (node.address.type !== "nacosConfig") return [];
  const normalized = query.toLocaleLowerCase();
  const fields: ResourceSearchField[] = [];
  if (node.address.dataId.toLocaleLowerCase().includes(normalized))
    fields.push("dataId");
  if (node.address.group.toLocaleLowerCase().includes(normalized))
    fields.push("group");
  return fields;
}

function withinScope(node: ResourceNode, scope: ResourceAddress) {
  if (scope.type === "root") return true;
  if (scope.type === "etcdPrefix") {
    const entry = entries.find(
      (item) => addressKey(item.node.address) === addressKey(node.address),
    );
    return entry ? addressKey(entry.parent) === addressKey(scope) : false;
  }
  if (scope.type === "zookeeper" && node.address.type === "zookeeper")
    return (
      node.address.path === scope.path ||
      node.address.path.startsWith(`${scope.path}/`)
    );
  return addressKey(node.address) === addressKey(scope);
}

async function afterDelay<T>(latencyMs: number, value: T): Promise<T> {
  if (latencyMs > 0)
    await new Promise((resolve) => globalThis.setTimeout(resolve, latencyMs));
  return clone(value);
}

export function workspaceModeFromSearch(search: string): WorkspaceMode {
  const value = new URLSearchParams(search).get("demo");
  return value === "1" || value === "true" ? "demo" : "live";
}

export function searchForWorkspaceMode(
  search: string,
  mode: WorkspaceMode,
): string {
  const parameters = new URLSearchParams(search);
  if (mode === "demo") parameters.set("demo", "1");
  else parameters.delete("demo");
  const next = parameters.toString();
  return next ? `?${next}` : "";
}

export function createDemoWorkspaceSource(latencyMs = 120): WorkspaceSource {
  const sessions = Object.fromEntries(
    DEMO_PROFILES.map((profile) => [profile.id, sessionFor(profile.id)]),
  );
  const initialEntry = entries.find(
    (entry) =>
      entry.connectionId === "demo-etcd" &&
      entry.node.name === "/production/payments/config.yaml",
  );

  return {
    kind: "demo",
    async bootstrap() {
      const rootPage = listResources("demo-etcd", ROOT_ADDRESS, undefined);
      return afterDelay(latencyMs, {
        capabilities: DEMO_CAPABILITIES,
        profiles: DEMO_PROFILES,
        sessions,
        selectedId: "demo-etcd",
        rootPage,
        document: initialEntry?.document,
      });
    },
    async openConnection(profile) {
      return afterDelay(latencyMs, sessionFor(profile.id));
    },
    async closeConnection() {
      return afterDelay(latencyMs, undefined);
    },
    cancelOperation() {
      return Promise.resolve(false);
    },
    async listResources(connectionId, parent, _operationId, cursor) {
      return afterDelay(latencyMs, listResources(connectionId, parent, cursor));
    },
    async readResource(connectionId, address) {
      const entry = entries.find(
        (item) =>
          item.connectionId === connectionId &&
          addressKey(item.node.address) === addressKey(address),
      );
      await afterDelay(latencyMs, undefined);
      if (!entry) throw new Error("演示资源不存在");
      if (entry.readError) throw new Error(entry.readError);
      if (!entry.document) throw new Error("演示资源不可直接读取");
      return clone(entry.document);
    },
    async searchResources(connectionId, scope, query, _operationId, cursor) {
      await afterDelay(latencyMs, undefined);
      if (query.trim() === "simulate-error")
        throw new Error("演示错误：有界搜索请求超时");
      const candidates = entries.filter(
        (entry) =>
          entry.connectionId === connectionId &&
          entry.node.readable &&
          withinScope(entry.node, scope),
      );
      const normalized = query.trim().toLocaleLowerCase();
      const matched = candidates.filter((entry) =>
        entry.node.name.toLocaleLowerCase().includes(normalized),
      );
      const offset = parseOffset(cursor, matched.length);
      const page = matched.slice(offset, offset + DEMO_SEARCH_PAGE_SIZE);
      const nextOffset = offset + page.length;
      return clone({
        scope,
        items: page.map((entry) => entry.node),
        matches: page.map((entry) => ({
          address: entry.node.address,
          fields: searchFields(entry.node, normalized),
        })),
        nextCursor:
          nextOffset < matched.length ? String(nextOffset) : undefined,
        scanned: Math.min(candidates.length, nextOffset),
        exhaustive: nextOffset >= matched.length,
      });
    },
    async inspectNativeResource(connectionId, address) {
      const entry = entries.find(
        (item) =>
          item.connectionId === connectionId &&
          addressKey(item.node.address) === addressKey(address),
      );
      await afterDelay(latencyMs, undefined);
      if (!entry?.nativeInfo) throw new Error("该演示资源没有协议原生元数据");
      return clone(entry.nativeInfo);
    },
  };
}

function listResources(
  connectionId: string,
  parent: ResourceAddress,
  cursor: string | undefined,
): ResourcePage {
  sessionFor(connectionId);
  const children = childEntries(connectionId, parent);
  if (connectionId === "demo-nacos" && parent.type === "root") {
    const pageNumber = cursor === undefined ? 1 : Number(cursor);
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > 2)
      throw new Error("演示 Nacos 页码无效");
    const start = (pageNumber - 1) * 2;
    return {
      parent,
      items: children.slice(start, start + 2).map((entry) => entry.node),
      numbered: { pageNumber, totalPages: 2 },
    };
  }
  const offset = parseOffset(cursor, children.length);
  const page = children.slice(offset, offset + DEMO_PAGE_SIZE);
  const nextOffset = offset + page.length;
  return {
    parent,
    items: page.map((entry) => entry.node),
    nextCursor: nextOffset < children.length ? String(nextOffset) : undefined,
  };
}
