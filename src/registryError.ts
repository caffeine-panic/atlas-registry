import type { RegistryError } from "./generated/RegistryError";
import type { RegistryErrorCode } from "./generated/RegistryErrorCode";
import type { AppLocale } from "./i18n";

export type { RegistryError, RegistryErrorCode };

const registryErrorCodes = new Set<RegistryErrorCode>([
  "validation",
  "notConnected",
  "unsupported",
  "notFound",
  "network",
  "invalidResponse",
  "timeout",
  "valueTooLarge",
  "conflict",
  "outcomeUnknown",
  "permissionDenied",
  "resourceExhausted",
  "auditIncomplete",
  "credentialMissing",
  "credentialStore",
  "tlsConfiguration",
  "sshHostKey",
  "storage",
  "cancelled",
  "productionLocked",
]);

const englishRegistryErrors: Record<RegistryErrorCode, string> = {
  validation: "The request is invalid",
  notConnected: "The registry connection is not open",
  unsupported: "This operation is not supported by the selected adapter",
  notFound: "The requested resource was not found",
  network: "The registry could not be reached",
  invalidResponse: "The registry returned an invalid response",
  timeout: "The registry operation timed out",
  valueTooLarge: "The resource exceeds the 1 MiB inline-value limit",
  conflict: "The resource changed; refresh before continuing",
  outcomeUnknown:
    "The remote outcome is unknown; verify server state before retrying",
  permissionDenied: "The registry denied this operation",
  resourceExhausted: "The bounded resource limit was reached",
  auditIncomplete:
    "The remote operation completed, but local audit recording failed",
  credentialMissing: "The required credential is missing",
  credentialStore: "The operating system credential vault is unavailable",
  tlsConfiguration: "The TLS configuration is invalid",
  sshHostKey: "The SSH host key does not match the pinned fingerprint",
  storage: "Local application storage is unavailable",
  cancelled: "The operation was cancelled",
  productionLocked:
    "This production connection is read-only; open a time-limited write window first",
};

export function isRegistryError(
  reason: unknown,
  code?: RegistryErrorCode,
): reason is RegistryError {
  if (!reason || typeof reason !== "object") return false;
  if (!("code" in reason) || typeof reason.code !== "string") return false;
  if (!("message" in reason) || typeof reason.message !== "string")
    return false;
  if (!("retryable" in reason) || typeof reason.retryable !== "boolean")
    return false;
  return (
    registryErrorCodes.has(reason.code as RegistryErrorCode) &&
    (code === undefined || reason.code === code)
  );
}

export function registryErrorMessage(
  reason: unknown,
  locale: AppLocale = "zh-CN",
): string {
  if (typeof reason === "string") return reason;
  if (locale === "en" && isRegistryError(reason)) {
    return englishRegistryErrors[reason.code];
  }
  if (isRegistryError(reason, "productionLocked")) {
    return "生产连接当前为只读；请在顶部限时解锁后重新确认操作";
  }
  if (reason && typeof reason === "object" && "message" in reason) {
    return String(reason.message);
  }
  return String(reason);
}

export type MutationFailureRecovery = "unknownOutcome" | "conflict" | "report";

export function mutationFailureRecovery(
  reason: unknown,
): MutationFailureRecovery {
  if (
    isRegistryError(reason, "outcomeUnknown") ||
    isRegistryError(reason, "auditIncomplete")
  ) {
    return "unknownOutcome";
  }
  if (isRegistryError(reason, "conflict")) return "conflict";
  return "report";
}
