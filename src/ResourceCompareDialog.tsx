import { connectionEnvironmentLabels } from "./registry";
import type { ConnectionProfile, ResourceDocument } from "./registry";
import {
  isComparableComparison,
  type ResourceComparison,
} from "./resourceCompare";
import {
  buildBoundedSafeChangeDiff,
  safeChangeAddressText,
} from "./safeChange";

type Props = {
  targetProfile: ConnectionProfile;
  targetDocument: ResourceDocument;
  sources: ConnectionProfile[];
  sourceId: string;
  comparison?: ResourceComparison;
  busy: boolean;
  writeAllowed: boolean;
  writeBlockedReason?: string;
  onSourceChange: (sourceId: string) => void;
  onCompare: () => void;
  onPromote: () => void;
  onCancelOperation: () => void;
  onClose: () => void;
};

export function ResourceCompareDialog({
  targetProfile,
  targetDocument,
  sources,
  sourceId,
  comparison,
  busy,
  writeAllowed,
  writeBlockedReason,
  onSourceChange,
  onCompare,
  onPromote,
  onCancelOperation,
  onClose,
}: Props) {
  const source = sources.find((profile) => profile.id === sourceId);
  const promotable =
    comparison?.kind === "different" ||
    (comparison?.kind === "binary" && comparison.equality === "different");

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
    >
      <section
        className="dialog resource-compare-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">COMPARE &amp; PROMOTE</span>
            <h2>跨环境资源比较</h2>
          </div>
          <button className="icon-button" disabled={busy} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="compare-route">
          <div>
            <span>来源</span>
            <select
              value={sourceId}
              disabled={busy || sources.length === 0}
              onChange={(event) => onSourceChange(event.target.value)}
            >
              {sources.length === 0 && (
                <option value="">无兼容的已连接来源</option>
              )}
              {sources.map((profile) => (
                <option value={profile.id} key={profile.id}>
                  {profile.name} ·{" "}
                  {connectionEnvironmentLabels[profile.environment]}
                </option>
              ))}
            </select>
          </div>
          <span className="compare-arrow" aria-hidden="true">
            →
          </span>
          <div>
            <span>目标</span>
            <b>{targetProfile.name}</b>
            <small>
              {connectionEnvironmentLabels[targetProfile.environment]}
            </small>
          </div>
        </div>

        <div className="impact-grid compare-target">
          <span>协议</span>
          <b>{targetProfile.adapter}</b>
          <span>精确地址</span>
          <b>{safeChangeAddressText(targetDocument.address)}</b>
          <span>目标版本</span>
          <b>{targetDocument.version ?? "不可提升"}</b>
        </div>

        {sources.length === 0 ? (
          <div className="compare-result neutral">
            请先打开另一个 {targetProfile.adapter}{" "}
            连接，再回到当前目标资源进行比较。
          </div>
        ) : (
          <ComparisonResult comparison={comparison} />
        )}

        {!writeAllowed && promotable && (
          <div className="mutation-warning">
            {writeBlockedReason ??
              "当前目标为只读。请先使用顶部生产锁横幅开启限时写入窗口。"}
          </div>
        )}
        <p className="form-note">
          仅对两个精确地址各读取一次，不扫描目录。来源 value
          只保存在当前内存状态，不写入日志、URL、审计元数据或工作区持久化。
        </p>
        <div className="dialog-actions">
          <button
            className="button"
            onClick={busy ? onCancelOperation : onClose}
          >
            {busy ? "取消读取" : "关闭"}
          </button>
          <button
            className="button"
            disabled={busy || !source}
            onClick={onCompare}
          >
            {busy ? "正在刷新比较…" : comparison ? "重新比较" : "开始比较"}
          </button>
          <button
            className="button primary"
            disabled={
              busy || !promotable || !writeAllowed || !targetDocument.version
            }
            onClick={onPromote}
          >
            刷新并进入安全变更
          </button>
        </div>
      </section>
    </div>
  );
}

function ComparisonResult({ comparison }: { comparison?: ResourceComparison }) {
  if (!comparison) {
    return <div className="compare-result neutral">尚未读取来源资源。</div>;
  }
  if (!isComparableComparison(comparison)) {
    return (
      <div className={`compare-result ${comparison.kind}`}>
        <b>{resultLabel(comparison)}</b>
        <span>{comparison.message}</span>
        {comparison.kind === "stale" && (
          <small>
            比较版本 {comparison.comparedVersion ?? "—"} · 当前版本{" "}
            {comparison.currentVersion ?? "—"}
          </small>
        )}
      </div>
    );
  }
  if (comparison.kind === "binary") {
    return (
      <div className={`compare-result binary ${comparison.equality}`}>
        <b>
          二进制资源 ·{" "}
          {comparison.equality === "equal" ? "内容相同" : "内容不同"}
        </b>
        <span>
          来源 {comparison.source.value.sizeBytes.toLocaleString()} B · 目标{" "}
          {comparison.target.value.sizeBytes.toLocaleString()} B
        </span>
        <small>提升时保持来源的二进制编码，不做 UTF-8 转换。</small>
      </div>
    );
  }
  if (comparison.kind === "equal") {
    return (
      <div className="compare-result equal">
        <b>内容相同</b>
        <span>来源与目标的字节内容一致，无需提升。</span>
      </div>
    );
  }
  const diff = buildBoundedSafeChangeDiff(
    comparison.target.value.content,
    comparison.source.value.content,
  );
  return (
    <div className="compare-result different">
      <div className="compare-result-heading">
        <b>内容不同</b>
        <span>
          <i>+{diff.added}</i> <em>−{diff.removed}</em>
        </span>
      </div>
      <div className="safe-change-diff compare-diff" role="table">
        {diff.lines.map((line, index) => (
          <div
            className={`diff-line ${line.kind}`}
            role="row"
            key={`${line.kind}-${line.beforeLine ?? ""}-${line.afterLine ?? ""}-${index}`}
          >
            <span className="diff-marker">
              {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}
            </span>
            <span className="diff-number">{line.beforeLine ?? ""}</span>
            <span className="diff-number">{line.afterLine ?? ""}</span>
            <code>{line.text || " "}</code>
          </div>
        ))}
      </div>
      {diff.truncated && <small>Diff 已按 200 行 / 32 KiB 上限截断。</small>}
    </div>
  );
}

function resultLabel(
  comparison: Exclude<
    ResourceComparison,
    { kind: "equal" | "different" | "binary" }
  >,
) {
  switch (comparison.kind) {
    case "missing":
      return "资源缺失";
    case "oversized":
      return "资源过大";
    case "unauthorized":
      return "无读取权限";
    case "cancelled":
      return "比较已取消";
    case "stale":
      return "比较结果已过期";
    case "failed":
      return "比较失败";
  }
}
