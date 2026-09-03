import { connectionEnvironmentLabels } from "./registry";
import {
  buildBoundedSafeChangeDiff,
  concurrencyStrategy,
  safeChangeAddressText,
  safeChangeRecovery,
  serializeSafeChangeReceipt,
  type SafeChangeOutcome,
  type SafeChangeState,
} from "./safeChange";

type SafeChangeDialogProps = {
  state: SafeChangeState;
  confirmationText: string;
  receiptCopied: boolean;
  onConfirmationTextChange: (value: string) => void;
  onPreflight: () => void;
  onApply: () => void;
  onCancelOperation: () => void;
  onCopyReceipt: () => void;
  onClose: () => void;
};

export function SafeChangeDialog({
  state,
  confirmationText,
  receiptCopied,
  onConfirmationTextChange,
  onPreflight,
  onApply,
  onCancelOperation,
  onCopyReceipt,
  onClose,
}: SafeChangeDialogProps) {
  const { plan } = state;
  const diff = buildBoundedSafeChangeDiff(
    plan.before.content,
    plan.after.value.content,
  );
  const running = state.phase === "preflighting" || state.phase === "applying";
  const canApply =
    state.phase === "ready" && confirmationText === plan.connectionName;

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={() => {
        if (!running) onClose();
      }}
    >
      <section
        className="dialog safe-change-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">SAFE CHANGE CENTER</span>
            <h2>单资源安全变更</h2>
          </div>
          <button className="icon-button" disabled={running} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="safe-change-layout">
          <div className="safe-change-main">
            <section className="safe-change-section">
              <div className="safe-change-section-heading">
                <div>
                  <span className="step-index">01</span>
                  <b>目标与并发条件</b>
                </div>
                <span className={`environment-pill ${plan.environment}`}>
                  {connectionEnvironmentLabels[plan.environment]}
                </span>
              </div>
              <div className="impact-grid safe-change-target">
                <span>连接</span>
                <b>{plan.connectionName}</b>
                <span>协议</span>
                <b>{plan.adapter}</b>
                <span>精确目标</span>
                <b className="safe-change-address">
                  {safeChangeAddressText(plan.address)}
                </b>
                <span>并发令牌</span>
                <b>{plan.expectedVersion}</b>
                <span>条件语义</span>
                <b>{concurrencyStrategy(plan.adapter)}</b>
              </div>
            </section>

            <section className="safe-change-section">
              <div className="safe-change-section-heading">
                <div>
                  <span className="step-index">02</span>
                  <b>有界 Before / After Diff</b>
                </div>
                <span className="diff-summary">
                  <i>+{diff.added}</i> <em>-{diff.removed}</em>
                </span>
              </div>
              <div className="safe-change-diff" role="table">
                {diff.lines.map((line, index) => (
                  <div
                    className={`diff-line ${line.kind}`}
                    role="row"
                    key={`${line.kind}-${line.beforeLine ?? ""}-${line.afterLine ?? ""}-${index}`}
                  >
                    <span className="diff-marker">
                      {line.kind === "add"
                        ? "+"
                        : line.kind === "remove"
                          ? "−"
                          : " "}
                    </span>
                    <span className="diff-number">{line.beforeLine ?? ""}</span>
                    <span className="diff-number">{line.afterLine ?? ""}</span>
                    <code>{line.text || " "}</code>
                  </div>
                ))}
              </div>
              {diff.truncated && (
                <p className="form-note">
                  Diff 只展示前 200 行 / 32 KiB；完整正文仍按 1 MiB
                  安全边界提交。
                </p>
              )}
            </section>
          </div>

          <aside className="safe-change-sidebar">
            <section className="safe-change-section">
              <div className="safe-change-section-heading">
                <div>
                  <span className="step-index">03</span>
                  <b>权威预检</b>
                </div>
                <PhaseBadge state={state} />
              </div>
              {state.phase === "review" && (
                <p className="form-note">
                  重新读取服务端版本；预检通过后才会开放单次条件提交。
                </p>
              )}
              {state.phase === "preflighting" && (
                <div className="safe-change-status checking">
                  正在读取权威状态…
                </div>
              )}
              {state.preflight?.kind === "ready" && (
                <div className="safe-change-status ready">
                  <b>预检通过</b>
                  <span>服务端令牌仍为 {state.preflight.checkedVersion}</span>
                </div>
              )}
              {state.outcome && <OutcomeSummary outcome={state.outcome} />}
            </section>

            {state.phase === "ready" && (
              <section className="safe-change-section">
                <div className="safe-change-section-heading">
                  <div>
                    <span className="step-index">04</span>
                    <b>明确确认</b>
                  </div>
                </div>
                <label className="production-confirmation safe-change-confirmation">
                  输入连接名 <b>{plan.connectionName}</b>
                  <input
                    value={confirmationText}
                    onChange={(event) =>
                      onConfirmationTextChange(event.target.value)
                    }
                    autoFocus
                    placeholder={plan.connectionName}
                  />
                </label>
                <p className="form-note">
                  提交只执行一次；结果不确定时不会自动重试。
                </p>
              </section>
            )}

            {state.receipt && (
              <section className="safe-change-section receipt-section">
                <div className="safe-change-section-heading">
                  <div>
                    <span className="step-index">05</span>
                    <b>脱敏收据</b>
                  </div>
                  <button className="button" onClick={onCopyReceipt}>
                    {receiptCopied ? "已复制" : "复制收据"}
                  </button>
                </div>
                <textarea
                  className="safe-change-receipt"
                  readOnly
                  value={serializeSafeChangeReceipt(state.receipt)}
                  aria-label="脱敏变更收据"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </section>
            )}
          </aside>
        </div>

        <div className="dialog-actions safe-change-actions">
          <button
            className="button"
            onClick={running ? onCancelOperation : onClose}
          >
            {running
              ? "取消请求"
              : state.phase === "complete"
                ? "关闭"
                : "返回"}
          </button>
          {state.phase === "review" && (
            <button className="button primary" onClick={onPreflight}>
              执行权威预检
            </button>
          )}
          {state.phase === "preflighting" && (
            <button className="button primary" disabled>
              预检中…
            </button>
          )}
          {state.phase === "ready" && (
            <button
              className="button primary"
              disabled={!canApply}
              onClick={onApply}
            >
              单次条件提交
            </button>
          )}
          {state.phase === "applying" && (
            <button className="button primary" disabled>
              提交并权威回读中…
            </button>
          )}
          {state.phase === "complete" && state.outcome?.kind === "failed" && (
            <button className="button" onClick={onPreflight}>
              重新预检
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function PhaseBadge({ state }: { state: SafeChangeState }) {
  const label =
    state.phase === "review"
      ? "待预检"
      : state.phase === "preflighting"
        ? "检查中"
        : state.phase === "ready"
          ? "可提交"
          : state.phase === "applying"
            ? "提交中"
            : outcomeLabel(state.outcome);
  return (
    <span className={`safe-change-phase ${state.outcome?.kind ?? state.phase}`}>
      {label}
    </span>
  );
}

function OutcomeSummary({ outcome }: { outcome: SafeChangeOutcome }) {
  const version =
    outcome.kind === "applied"
      ? outcome.confirmedVersion
      : outcome.kind !== "failed"
        ? outcome.checkedVersion
        : undefined;
  return (
    <div className={`safe-change-status ${outcome.kind}`}>
      <b>{outcomeLabel(outcome)}</b>
      {version && <span>权威版本：{version}</span>}
      {outcome.kind === "applied" && (
        <span>
          {outcome.readback === "confirmed"
            ? "权威回读已确认提交结果"
            : outcome.readback === "advancedAfterApply"
              ? "提交后资源又发生了变化"
              : "提交成功，但权威回读暂不可用"}
        </span>
      )}
      {outcome.kind !== "applied" && <span>{outcome.message}</span>}
      <small>{safeChangeRecovery(outcome)}</small>
    </div>
  );
}

function outcomeLabel(outcome: SafeChangeOutcome | undefined) {
  switch (outcome?.kind) {
    case "applied":
      return "已应用";
    case "conflict":
      return "版本冲突";
    case "outcomeUnknown":
      return "远端结果未知";
    case "auditIncomplete":
      return "审计未完成";
    case "failed":
      return "未提交";
    default:
      return "已结束";
  }
}
