import { useState } from "react";
import type { ConnectionProfile, ProductionLockStatus } from "./registry";
import { formatUnlockRemaining } from "./productionLock";

type Props = {
  profile: ConnectionProfile;
  status: ProductionLockStatus;
  busy: boolean;
  onUnlock: (confirmation: string, durationSeconds: number) => Promise<void>;
  onLock: () => Promise<void>;
};

const durations = [300, 900, 1_800, 3_600];

export function ProductionLockBanner({
  profile,
  status,
  busy,
  onUnlock,
  onLock,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(900);
  const locked = status.locked;

  return (
    <>
      <section
        className={`production-lock-banner ${locked ? "locked" : "unlocked"}`}
        aria-live="polite"
      >
        <div>
          <b>{locked ? "生产环境只读锁已启用" : "生产写入窗口已开启"}</b>
          <span>
            {locked
              ? `${profile.name} 的所有通用与协议原生写入都会在发送前拒绝。`
              : `剩余 ${formatUnlockRemaining(status.remainingSeconds)}；到期立即恢复只读。`}
          </span>
        </div>
        {locked ? (
          <button
            className="button danger"
            disabled={busy}
            onClick={() => setDialogOpen(true)}
          >
            限时解锁
          </button>
        ) : (
          <button
            className="button"
            disabled={busy}
            onClick={() => void onLock()}
          >
            立即恢复只读
          </button>
        )}
      </section>

      {dialogOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={() => {
            if (!busy) setDialogOpen(false);
          }}
        >
          <section
            className="dialog production-unlock-dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-heading">
              <div>
                <span className="eyebrow">PRODUCTION WRITE WINDOW</span>
                <h2>限时解锁生产写入</h2>
              </div>
              <button
                className="icon-button"
                disabled={busy}
                onClick={() => setDialogOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="mutation-warning danger-warning">
              解锁只对当前桌面会话生效，不写入连接配置。断开、关闭应用或倒计时结束都会恢复只读。
            </div>
            <label>
              写入窗口
              <select
                value={durationSeconds}
                disabled={busy}
                onChange={(event) =>
                  setDurationSeconds(Number(event.target.value))
                }
              >
                {durations.map((seconds) => (
                  <option value={seconds} key={seconds}>
                    {seconds / 60} 分钟
                  </option>
                ))}
              </select>
            </label>
            <label className="production-confirmation">
              输入精确连接名 <b>{profile.name}</b>
              <input
                value={confirmation}
                disabled={busy}
                autoFocus
                placeholder={profile.name}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <p className="form-note">
              审计仅记录连接 ID、操作 ID 与解锁时长，不记录 endpoint、凭据或资源
              value。
            </p>
            <div className="dialog-actions">
              <button
                className="button"
                disabled={busy}
                onClick={() => setDialogOpen(false)}
              >
                取消
              </button>
              <button
                className="button danger"
                disabled={busy || confirmation !== profile.name}
                onClick={() =>
                  void onUnlock(confirmation, durationSeconds).then(() => {
                    setConfirmation("");
                    setDialogOpen(false);
                  })
                }
              >
                {busy ? "正在解锁…" : "确认限时解锁"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
