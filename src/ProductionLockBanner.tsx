import { useState } from "react";
import type { ConnectionProfile, ProductionLockStatus } from "./registry";
import { formatUnlockRemaining } from "./productionLock";
import type { Translator } from "./i18n";

type Props = {
  profile: ConnectionProfile;
  status: ProductionLockStatus;
  busy: boolean;
  t: Translator;
  onUnlock: (confirmation: string, durationSeconds: number) => Promise<void>;
  onLock: () => Promise<void>;
};

const durations = [300, 900, 1_800, 3_600];

export function ProductionLockBanner({
  profile,
  status,
  busy,
  t,
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
          <b>{locked ? t("production.locked") : t("production.unlocked")}</b>
          <span>
            {locked
              ? t("production.blocked", { name: profile.name })
              : t("production.remaining", {
                  remaining: formatUnlockRemaining(status.remainingSeconds),
                })}
          </span>
        </div>
        {locked ? (
          <button
            className="button danger"
            disabled={busy}
            onClick={() => setDialogOpen(true)}
          >
            {t("production.unlock")}
          </button>
        ) : (
          <button
            className="button"
            disabled={busy}
            onClick={() => void onLock()}
          >
            {t("production.lockNow")}
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
                <h2>{t("production.unlockTitle")}</h2>
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
              {t("production.unlockHelp")}
            </div>
            <label>
              {t("production.duration")}
              <select
                value={durationSeconds}
                disabled={busy}
                onChange={(event) =>
                  setDurationSeconds(Number(event.target.value))
                }
              >
                {durations.map((seconds) => (
                  <option value={seconds} key={seconds}>
                    {t("production.minutes", { minutes: seconds / 60 })}
                  </option>
                ))}
              </select>
            </label>
            <label className="production-confirmation">
              {t("production.confirmName", { name: profile.name })}
              <input
                value={confirmation}
                disabled={busy}
                autoFocus
                placeholder={profile.name}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <p className="form-note">{t("production.auditHelp")}</p>
            <div className="dialog-actions">
              <button
                className="button"
                disabled={busy}
                onClick={() => setDialogOpen(false)}
              >
                {t("common.cancel")}
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
                {busy
                  ? t("production.unlocking")
                  : t("production.confirmUnlock")}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
