import type { ProductionLockStatus } from "./registry";

export function effectiveProductionLock(
  status: ProductionLockStatus | undefined,
  nowMs: number,
): ProductionLockStatus | undefined {
  if (!status || !status.production || status.locked) return status;
  if (!status.unlockedUntilMs || status.unlockedUntilMs <= nowMs) {
    return {
      ...status,
      locked: true,
      unlockedUntilMs: null,
      remainingSeconds: null,
    };
  }
  return {
    ...status,
    remainingSeconds: Math.max(
      1,
      Math.ceil((status.unlockedUntilMs - nowMs) / 1_000),
    ),
  };
}

export function productionWriteAllowed(
  production: boolean,
  status: ProductionLockStatus | undefined,
  nowMs: number,
) {
  if (!production) return true;
  return effectiveProductionLock(status, nowMs)?.locked === false;
}

export function formatUnlockRemaining(seconds: number | null) {
  if (!seconds) return "已到期";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder
    .toString()
    .padStart(2, "0")}`;
}
