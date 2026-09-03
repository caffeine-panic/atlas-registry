import type {
  ConnectionProfile,
  ResourceAddress,
  ResourceDocument,
} from "./registry";
import { isRegistryError, registryErrorMessage } from "./registryError";

export type ResourceComparison =
  | {
      kind: "equal" | "different";
      source: ResourceDocument;
      target: ResourceDocument;
    }
  | {
      kind: "binary";
      equality: "equal" | "different";
      source: ResourceDocument;
      target: ResourceDocument;
    }
  | {
      kind: "missing" | "oversized" | "unauthorized" | "cancelled" | "failed";
      side: "source" | "target";
      message: string;
    }
  | {
      kind: "stale";
      side: "source" | "target";
      comparedVersion?: string;
      currentVersion?: string;
      message: string;
    };

export type ComparableResourceComparison = Extract<
  ResourceComparison,
  { kind: "equal" | "different" | "binary" }
>;

export function compatibleSourceProfiles(
  profiles: ConnectionProfile[],
  openConnectionIds: ReadonlySet<string>,
  target: ConnectionProfile,
) {
  return profiles.filter(
    (profile) =>
      profile.id !== target.id &&
      profile.adapter === target.adapter &&
      openConnectionIds.has(profile.id),
  );
}

export function addressMatchesAdapter(
  adapter: ConnectionProfile["adapter"],
  address: ResourceAddress,
) {
  return (
    (adapter === "etcd" && address.type === "etcd") ||
    (adapter === "zookeeper" && address.type === "zookeeper") ||
    (adapter === "nacos" && address.type === "nacosConfig")
  );
}

export function compareResourceDocuments(
  source: ResourceDocument,
  target: ResourceDocument,
): ResourceComparison {
  if (JSON.stringify(source.address) !== JSON.stringify(target.address)) {
    return {
      kind: "failed",
      side: "source",
      message: "来源与目标不是同一个精确资源地址",
    };
  }
  const equal = equalValue(source.value, target.value);
  if (
    source.value.encoding === "base64" ||
    target.value.encoding === "base64"
  ) {
    return {
      kind: "binary",
      equality: equal ? "equal" : "different",
      source,
      target,
    };
  }
  return { kind: equal ? "equal" : "different", source, target };
}

export function classifyComparisonError(
  reason: unknown,
  side: "source" | "target",
): ResourceComparison {
  if (isRegistryError(reason, "notFound")) {
    return { kind: "missing", side, message: `${sideLabel(side)}资源不存在` };
  }
  if (isRegistryError(reason, "valueTooLarge")) {
    return {
      kind: "oversized",
      side,
      message: `${sideLabel(side)}资源超过 1 MiB 内联比较上限`,
    };
  }
  if (isRegistryError(reason, "permissionDenied")) {
    return {
      kind: "unauthorized",
      side,
      message: `${sideLabel(side)}连接无权读取该资源`,
    };
  }
  if (isRegistryError(reason, "cancelled")) {
    return { kind: "cancelled", side, message: "比较读取已取消" };
  }
  return { kind: "failed", side, message: registryErrorMessage(reason) };
}

export function staleComparison(
  comparison: ComparableResourceComparison,
  refreshedSource: ResourceDocument,
  refreshedTarget: ResourceDocument,
): Extract<ResourceComparison, { kind: "stale" }> | undefined {
  if (!sameDocumentVersion(comparison.source, refreshedSource)) {
    return staleResult(
      "source",
      comparison.source.version,
      refreshedSource.version,
    );
  }
  if (!sameDocumentVersion(comparison.target, refreshedTarget)) {
    return staleResult(
      "target",
      comparison.target.version,
      refreshedTarget.version,
    );
  }
  return undefined;
}

export function isComparableComparison(
  comparison: ResourceComparison | undefined,
): comparison is ComparableResourceComparison {
  return (
    comparison?.kind === "equal" ||
    comparison?.kind === "different" ||
    comparison?.kind === "binary"
  );
}

function equalValue(
  source: ResourceDocument["value"],
  target: ResourceDocument["value"],
) {
  const sourceBytes = valueBytes(source);
  const targetBytes = valueBytes(target);
  return (
    sourceBytes.length === targetBytes.length &&
    sourceBytes.every((byte, index) => byte === targetBytes[index])
  );
}

function valueBytes(value: ResourceDocument["value"]) {
  if (value.encoding === "utf8") return new TextEncoder().encode(value.content);
  const binary = atob(value.content);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function sameDocumentVersion(
  compared: ResourceDocument,
  refreshed: ResourceDocument,
) {
  return (
    compared.version === refreshed.version &&
    compared.value.encoding === refreshed.value.encoding &&
    compared.value.content === refreshed.value.content
  );
}

function staleResult(
  side: "source" | "target",
  comparedVersion?: string,
  currentVersion?: string,
): Extract<ResourceComparison, { kind: "stale" }> {
  return {
    kind: "stale",
    side,
    comparedVersion,
    currentVersion,
    message: `${sideLabel(side)}资源在比较后发生变化，请重新比较`,
  };
}

function sideLabel(side: "source" | "target") {
  return side === "source" ? "来源" : "目标";
}
