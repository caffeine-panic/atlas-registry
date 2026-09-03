import type {
  AdapterId,
  ConnectionEnvironment,
  ConnectionProfile,
  MutationResult,
  ResourceAddress,
  ResourceDocument,
  ResourceMutation,
  ResourceSnapshot,
} from "./registry";
import { isRegistryError, registryErrorMessage } from "./registryError";

const MAX_DIFF_LINES = 200;
const MAX_DIFF_CHARACTERS = 32 * 1024;
const MAX_DIFF_LINE_CHARACTERS = 600;

export type SafeChangePlan = {
  workflowId: string;
  connectionId: string;
  connectionName: string;
  adapter: AdapterId;
  environment: ConnectionEnvironment;
  address: ResourceAddress;
  resourceName: string;
  expectedVersion: string;
  before: ResourceDocument["value"];
  after: ResourceMutation & { operation: "update" };
};

export type SafeChangePreflight =
  | {
      kind: "ready";
      checkedVersion: string;
      checkedAtMs: number;
    }
  | {
      kind: "conflict";
      checkedVersion?: string;
      checkedAtMs: number;
      message: string;
    };

export type SafeChangeReadback =
  | "confirmed"
  | "advancedAfterApply"
  | "unavailable";

export type SafeChangeReconciliation =
  | "matchesProposed"
  | "differsFromProposed"
  | "unavailable";

export type SafeChangeOutcome =
  | {
      kind: "applied";
      result: MutationResult;
      authoritative?: ResourceDocument;
      confirmedVersion?: string;
      readback: SafeChangeReadback;
      message?: string;
    }
  | {
      kind: "conflict" | "outcomeUnknown" | "auditIncomplete";
      message: string;
      authoritative?: ResourceDocument;
      checkedVersion?: string;
      reconciliation: SafeChangeReconciliation;
    }
  | {
      kind: "failed";
      message: string;
    };

export type SafeChangeReceipt = {
  schemaVersion: 1;
  kind: "atlasSafeChangeReceipt";
  workflowId: string;
  completedAt: string;
  status: SafeChangeOutcome["kind"];
  target: {
    adapter: AdapterId;
    environment: ConnectionEnvironment;
    address: string;
  };
  concurrency: {
    strategy: string;
    expectedVersion: string;
    preflightVersion?: string;
    confirmedVersion?: string;
  };
  result: {
    consistency?: MutationResult["consistency"];
    previous?: ResourceSnapshot;
    current?: ResourceSnapshot;
    readback?: SafeChangeReadback;
    reconciliation?: SafeChangeReconciliation;
    audit: "recorded" | "incomplete" | "notConfirmed";
  };
  recovery: string;
};

export type SafeChangeDiffLine = {
  kind: "equal" | "remove" | "add";
  beforeLine?: number;
  afterLine?: number;
  text: string;
};

export type SafeChangeDiff = {
  lines: SafeChangeDiffLine[];
  added: number;
  removed: number;
  unchanged: number;
  truncated: boolean;
};

export type SafeChangeState = {
  plan: SafeChangePlan;
  phase: "review" | "preflighting" | "ready" | "applying" | "complete";
  preflight?: SafeChangePreflight;
  outcome?: SafeChangeOutcome;
  receipt?: SafeChangeReceipt;
};

export type SafeChangeAction =
  | { type: "startPreflight" }
  | { type: "preflightReady"; preflight: SafeChangePreflight }
  | {
      type: "complete";
      preflight?: SafeChangePreflight;
      outcome: SafeChangeOutcome;
      receipt: SafeChangeReceipt;
    }
  | { type: "startApply" };

export function createSafeChangePlan(
  profile: ConnectionProfile,
  document: ResourceDocument,
  afterContent: string,
  workflowId: string,
): SafeChangePlan {
  if (!document.version?.trim())
    throw new Error("安全变更需要当前资源的并发版本");
  return {
    workflowId,
    connectionId: profile.id,
    connectionName: profile.name,
    adapter: profile.adapter,
    environment: profile.environment,
    address: document.address,
    resourceName: document.name,
    expectedVersion: document.version,
    before: document.value,
    after: {
      operation: "update",
      address: document.address,
      value: { content: afterContent, encoding: document.value.encoding },
      contentType: document.contentType,
      expectedVersion: document.version,
    },
  };
}

export function initialSafeChangeState(plan: SafeChangePlan): SafeChangeState {
  return { plan, phase: "review" };
}

export function reduceSafeChange(
  state: SafeChangeState,
  action: SafeChangeAction,
): SafeChangeState {
  switch (action.type) {
    case "startPreflight":
      if (state.phase === "applying") return state;
      return {
        plan: state.plan,
        phase: "preflighting",
      };
    case "preflightReady":
      if (state.phase !== "preflighting" || action.preflight.kind !== "ready")
        return state;
      return {
        plan: state.plan,
        phase: "ready",
        preflight: action.preflight,
      };
    case "startApply":
      if (state.phase !== "ready" || state.preflight?.kind !== "ready")
        return state;
      return { ...state, phase: "applying" };
    case "complete":
      return {
        plan: state.plan,
        phase: "complete",
        preflight: action.preflight ?? state.preflight,
        outcome: action.outcome,
        receipt: action.receipt,
      };
  }
}

export async function preflightSafeChange(
  plan: SafeChangePlan,
  readAuthoritative: (
    connectionId: string,
    address: ResourceAddress,
  ) => Promise<ResourceDocument>,
  now: () => number = Date.now,
): Promise<SafeChangePreflight> {
  const current = await readAuthoritative(plan.connectionId, plan.address);
  const checkedVersion = current.version;
  if (checkedVersion !== plan.expectedVersion) {
    return {
      kind: "conflict",
      checkedVersion,
      checkedAtMs: now(),
      message: checkedVersion
        ? `预检发现远端版本已从 ${plan.expectedVersion} 变为 ${checkedVersion}`
        : "预检发现远端资源不再提供可用于条件更新的版本",
    };
  }
  return { kind: "ready", checkedVersion, checkedAtMs: now() };
}

export async function applySafeChange(
  plan: SafeChangePlan,
  applyMutation: (mutation: SafeChangePlan["after"]) => Promise<MutationResult>,
  readAuthoritative: (
    connectionId: string,
    address: ResourceAddress,
  ) => Promise<ResourceDocument>,
): Promise<SafeChangeOutcome> {
  let result: MutationResult;
  try {
    result = await applyMutation(plan.after);
  } catch (reason) {
    const kind = failureKind(reason);
    if (kind === "failed") {
      return { kind, message: registryErrorMessage(reason) };
    }
    const authoritative = await readAfterFailure(plan, readAuthoritative);
    return {
      kind,
      message: registryErrorMessage(reason),
      authoritative,
      checkedVersion: authoritative?.version,
      reconciliation: reconcile(plan, authoritative),
    };
  }

  try {
    const authoritative = await readAuthoritative(
      plan.connectionId,
      plan.address,
    );
    const confirmedVersion = authoritative.version ?? result.current?.version;
    return {
      kind: "applied",
      result,
      authoritative,
      confirmedVersion,
      readback:
        result.current?.version &&
        authoritative.version !== result.current.version
          ? "advancedAfterApply"
          : "confirmed",
    };
  } catch (reason) {
    return {
      kind: "applied",
      result,
      confirmedVersion: result.current?.version,
      readback: "unavailable",
      message: registryErrorMessage(reason),
    };
  }
}

async function readAfterFailure(
  plan: SafeChangePlan,
  readAuthoritative: (
    connectionId: string,
    address: ResourceAddress,
  ) => Promise<ResourceDocument>,
) {
  try {
    return await readAuthoritative(plan.connectionId, plan.address);
  } catch {
    return undefined;
  }
}

function failureKind(
  reason: unknown,
): "conflict" | "outcomeUnknown" | "auditIncomplete" | "failed" {
  if (isRegistryError(reason, "conflict")) return "conflict";
  if (isRegistryError(reason, "outcomeUnknown")) return "outcomeUnknown";
  if (isRegistryError(reason, "auditIncomplete")) return "auditIncomplete";
  return "failed";
}

function reconcile(
  plan: SafeChangePlan,
  authoritative: ResourceDocument | undefined,
): SafeChangeReconciliation {
  if (!authoritative) return "unavailable";
  return authoritative.value.encoding === plan.after.value.encoding &&
    authoritative.value.content === plan.after.value.content
    ? "matchesProposed"
    : "differsFromProposed";
}

export function preflightConflictOutcome(
  preflight: Extract<SafeChangePreflight, { kind: "conflict" }>,
): SafeChangeOutcome {
  return {
    kind: "conflict",
    message: preflight.message,
    checkedVersion: preflight.checkedVersion,
    reconciliation: "unavailable",
  };
}

export function failedSafeChangeOutcome(reason: unknown): SafeChangeOutcome {
  return { kind: "failed", message: registryErrorMessage(reason) };
}

export function buildSafeChangeReceipt(
  plan: SafeChangePlan,
  preflight: SafeChangePreflight | undefined,
  outcome: SafeChangeOutcome,
  completedAtMs: number = Date.now(),
): SafeChangeReceipt {
  const applied = outcome.kind === "applied" ? outcome : undefined;
  const reconciled =
    outcome.kind === "conflict" ||
    outcome.kind === "outcomeUnknown" ||
    outcome.kind === "auditIncomplete"
      ? outcome
      : undefined;
  return {
    schemaVersion: 1,
    kind: "atlasSafeChangeReceipt",
    workflowId: plan.workflowId,
    completedAt: new Date(completedAtMs).toISOString(),
    status: outcome.kind,
    target: {
      adapter: plan.adapter,
      environment: plan.environment,
      address: safeChangeAddressText(plan.address),
    },
    concurrency: {
      strategy: concurrencyStrategy(plan.adapter),
      expectedVersion: plan.expectedVersion,
      preflightVersion: preflight?.checkedVersion,
      confirmedVersion: applied?.confirmedVersion ?? reconciled?.checkedVersion,
    },
    result: {
      consistency: applied?.result.consistency,
      previous: receiptSnapshot(applied?.result.previous),
      current: receiptSnapshot(applied?.result.current),
      readback: applied?.readback,
      reconciliation: reconciled?.reconciliation,
      audit:
        outcome.kind === "applied"
          ? "recorded"
          : outcome.kind === "auditIncomplete"
            ? "incomplete"
            : "notConfirmed",
    },
    recovery: safeChangeRecovery(outcome),
  };
}

function receiptSnapshot(snapshot: ResourceSnapshot | undefined) {
  if (!snapshot) return undefined;
  return {
    version: snapshot.version,
    sha256: snapshot.sha256,
    sizeBytes: snapshot.sizeBytes,
    encoding: snapshot.encoding,
  };
}

export function serializeSafeChangeReceipt(receipt: SafeChangeReceipt) {
  return JSON.stringify(receipt, undefined, 2);
}

export function safeChangeRecovery(outcome: SafeChangeOutcome): string {
  switch (outcome.kind) {
    case "applied":
      if (outcome.readback === "unavailable")
        return "变更已提交；恢复连接后重新读取目标资源，核对权威版本。";
      if (outcome.readback === "advancedAfterApply")
        return "变更已提交，但资源随后再次变化；评审最新版本后再决定是否继续。";
      return "权威回读已确认，无需重试。";
    case "conflict":
      return "刷新资源，以最新版本重新生成 diff 和预检；不要覆盖他人的变更。";
    case "outcomeUnknown":
      return "远端结果未知；核对权威状态后再决定下一步，切勿直接重试。";
    case "auditIncomplete":
      return "远端变更已确认成功，但审计完成记录失败；保存本收据并人工补充变更记录。";
    case "failed":
      return "变更未确认提交；修复错误后重新执行预检。";
  }
}

export function concurrencyStrategy(adapter: AdapterId) {
  switch (adapter) {
    case "etcd":
      return "etcd revision compare-and-swap";
    case "zookeeper":
      return "ZooKeeper version compare-and-swap";
    case "nacos":
      return "Nacos MD5 conditional publish";
  }
}

export function safeChangeAddressText(address: ResourceAddress) {
  switch (address.type) {
    case "root":
      return "/";
    case "etcdPrefix":
      return `etcd-prefix:${address.prefixBase64}`;
    case "etcd":
      return `etcd:${decodeEtcdKey(address.keyBase64)}`;
    case "zookeeper":
      return address.path;
    case "nacosConfig":
      return `${address.group} / ${address.dataId}`;
  }
}

function decodeEtcdKey(keyBase64: string) {
  try {
    const binary = globalThis.atob(keyBase64);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return `base64:${keyBase64}`;
  }
}

export function buildBoundedSafeChangeDiff(
  before: string,
  after: string,
): SafeChangeDiff {
  const beforeLines = boundedLines(before);
  const afterLines = boundedLines(after);
  const matrix = Array.from(
    { length: beforeLines.lines.length + 1 },
    () => new Uint16Array(afterLines.lines.length + 1),
  );
  for (
    let beforeIndex = beforeLines.lines.length - 1;
    beforeIndex >= 0;
    --beforeIndex
  ) {
    for (
      let afterIndex = afterLines.lines.length - 1;
      afterIndex >= 0;
      --afterIndex
    ) {
      matrix[beforeIndex][afterIndex] =
        beforeLines.lines[beforeIndex] === afterLines.lines[afterIndex]
          ? matrix[beforeIndex + 1][afterIndex + 1] + 1
          : Math.max(
              matrix[beforeIndex + 1][afterIndex],
              matrix[beforeIndex][afterIndex + 1],
            );
    }
  }

  const lines: SafeChangeDiffLine[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  while (
    beforeIndex < beforeLines.lines.length ||
    afterIndex < afterLines.lines.length
  ) {
    if (
      beforeIndex < beforeLines.lines.length &&
      afterIndex < afterLines.lines.length &&
      beforeLines.lines[beforeIndex] === afterLines.lines[afterIndex]
    ) {
      lines.push({
        kind: "equal",
        beforeLine: beforeIndex + 1,
        afterLine: afterIndex + 1,
        text: beforeLines.lines[beforeIndex],
      });
      beforeIndex += 1;
      afterIndex += 1;
      unchanged += 1;
    } else if (
      afterIndex >= afterLines.lines.length ||
      (beforeIndex < beforeLines.lines.length &&
        matrix[beforeIndex + 1][afterIndex] >=
          matrix[beforeIndex][afterIndex + 1])
    ) {
      lines.push({
        kind: "remove",
        beforeLine: beforeIndex + 1,
        text: beforeLines.lines[beforeIndex],
      });
      beforeIndex += 1;
      removed += 1;
    } else {
      lines.push({
        kind: "add",
        afterLine: afterIndex + 1,
        text: afterLines.lines[afterIndex],
      });
      afterIndex += 1;
      added += 1;
    }
  }
  return {
    lines,
    added,
    removed,
    unchanged,
    truncated: beforeLines.truncated || afterLines.truncated,
  };
}

function boundedLines(value: string) {
  const characterBounded = value.slice(0, MAX_DIFF_CHARACTERS);
  const allLines = characterBounded.split(/\r?\n/);
  const lines = allLines
    .slice(0, MAX_DIFF_LINES)
    .map((line) =>
      line.length > MAX_DIFF_LINE_CHARACTERS
        ? `${line.slice(0, MAX_DIFF_LINE_CHARACTERS)}…`
        : line,
    );
  return {
    lines,
    truncated:
      value.length > MAX_DIFF_CHARACTERS || allLines.length > MAX_DIFF_LINES,
  };
}
