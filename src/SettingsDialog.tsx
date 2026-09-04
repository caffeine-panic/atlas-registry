import { useState } from "react";
import {
  normalizeUpdateProxySettings,
  type UpdateProxySettings,
} from "./updateSettings";
import type { AppLocale, Translator } from "./i18n";

type SettingsDialogProps = {
  settings: UpdateProxySettings;
  locale: AppLocale;
  t: Translator;
  onSave: (settings: UpdateProxySettings, locale: AppLocale) => void;
  onCancel: () => void;
};

export function SettingsDialog({
  settings,
  locale,
  t,
  onSave,
  onCancel,
}: SettingsDialogProps) {
  const [draft, setDraft] = useState<UpdateProxySettings>(settings);
  const [draftLocale, setDraftLocale] = useState(locale);
  const [manualUrl, setManualUrl] = useState(
    settings.mode === "manual" ? settings.url : "",
  );
  const [error, setError] = useState<string>();

  const selectMode = (mode: UpdateProxySettings["mode"]) => {
    setError(undefined);
    setDraft(mode === "manual" ? { mode, url: manualUrl } : { mode });
  };

  const save = () => {
    try {
      onSave(
        normalizeUpdateProxySettings(
          draft.mode === "manual" ? { mode: "manual", url: manualUrl } : draft,
        ),
        draftLocale,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <section
        className="dialog settings-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">APPLICATION SETTINGS</span>
            <h2>{t("settings.title")}</h2>
          </div>
          <button className="icon-button" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="form-section">
          <div className="form-section-title">{t("settings.language")}</div>
          <label>
            {t("settings.language")}
            <select
              value={draftLocale}
              onChange={(event) =>
                setDraftLocale(event.target.value as AppLocale)
              }
            >
              <option value="en">{t("settings.english")}</option>
              <option value="zh-CN">{t("settings.chinese")}</option>
            </select>
          </label>
          <p className="form-note">{t("settings.languageHelp")}</p>
        </div>

        <div className="form-section">
          <div className="form-section-title">
            {t("settings.updateNetwork")}
          </div>
          <div className="proxy-options">
            <label className={draft.mode === "system" ? "selected" : ""}>
              <input
                type="radio"
                checked={draft.mode === "system"}
                onChange={() => selectMode("system")}
              />
              <span>
                <b>{t("settings.systemProxy")}</b>
                <small>{t("settings.systemProxyHelp")}</small>
              </span>
            </label>
            <label className={draft.mode === "manual" ? "selected" : ""}>
              <input
                type="radio"
                checked={draft.mode === "manual"}
                onChange={() => selectMode("manual")}
              />
              <span>
                <b>{t("settings.manualProxy")}</b>
                <small>{t("settings.manualProxyHelp")}</small>
              </span>
            </label>
            {draft.mode === "manual" && (
              <input
                autoFocus
                value={manualUrl}
                onChange={(event) => {
                  setManualUrl(event.target.value);
                  setDraft({ mode: "manual", url: event.target.value });
                  setError(undefined);
                }}
                placeholder="http://127.0.0.1:7897"
                spellCheck={false}
              />
            )}
            <label className={draft.mode === "disabled" ? "selected" : ""}>
              <input
                type="radio"
                checked={draft.mode === "disabled"}
                onChange={() => selectMode("disabled")}
              />
              <span>
                <b>{t("settings.noProxy")}</b>
                <small>{t("settings.noProxyHelp")}</small>
              </span>
            </label>
          </div>
          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="dialog-actions">
          <button className="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button className="button primary" onClick={save}>
            {t("common.saveSettings")}
          </button>
        </div>
      </section>
    </div>
  );
}
