import { authModes } from "./connectionAuth";
import { connectionEnvironmentLabel } from "./i18n";
import type { AppLocale, MessageKey, Translator } from "./i18n";
import type {
  AdapterId,
  AuthenticationMode,
  ConnectionEnvironment,
  ConnectionProfile,
  SshAuthenticationMode,
} from "./registry";

export type ConnectionDialogMode = "new" | "edit" | "copy";

type ConnectionDialogProps = {
  mode: ConnectionDialogMode;
  form: ConnectionProfile;
  secret: string;
  sshSecret: string;
  busy: boolean;
  testing: boolean;
  locale: AppLocale;
  t: Translator;
  onChange: (profile: ConnectionProfile) => void;
  onSecretChange: (secret: string) => void;
  onSshSecretChange: (secret: string) => void;
  onCancel: () => void;
  onTest: () => void;
  onSave: () => void;
  onDelete: () => void;
  onCancelOperation: () => void;
};

const endpointDefaults: Record<AdapterId, string> = {
  etcd: "127.0.0.1:2379",
  zookeeper: "127.0.0.1:2181",
  nacos: "127.0.0.1:8848",
};

const endpointPlaceholderKeys: Record<AdapterId, MessageKey | undefined> = {
  etcd: "connection.endpointEtcd",
  zookeeper: "connection.endpointZookeeper",
  nacos: undefined,
};

export function ConnectionDialog({
  mode,
  form,
  secret,
  sshSecret,
  busy,
  testing,
  locale,
  t,
  onChange,
  onSecretChange,
  onSshSecretChange,
  onCancel,
  onTest,
  onSave,
  onDelete,
  onCancelOperation,
}: ConnectionDialogProps) {
  const authenticated = form.auth.mode !== "none";
  const supportsTls = form.adapter !== "nacos";
  const title =
    mode === "edit"
      ? t("connection.edit")
      : mode === "copy"
        ? t("connection.copy")
        : t("connection.new");
  const endpointPlaceholder = endpointPlaceholderKeys[form.adapter];

  const changeAdapter = (adapter: AdapterId) => {
    onSecretChange("");
    onSshSecretChange("");
    onChange({
      ...form,
      adapter,
      endpoint: endpointDefaults[adapter],
      namespace: "",
      auth: { mode: "none", username: "", customKey: "" },
      tls: {
        enabled: false,
        caCertificatePath: "",
        clientCertificatePath: "",
        clientKeyPath: "",
        serverName: "",
      },
      sshTunnel: {
        enabled: false,
        host: "",
        port: 22,
        username: "",
        authentication: "password",
        privateKeyPath: "",
        hostKeyFingerprint: "",
      },
    });
  };

  const changeAuthMode = (authMode: AuthenticationMode) => {
    onSecretChange("");
    onChange({
      ...form,
      auth: { mode: authMode, username: "", customKey: "" },
    });
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={() => {
        if (!testing) onCancel();
      }}
    >
      <section
        className="dialog connection-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">CONNECTION</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" disabled={testing} onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="form-grid equal">
          <label>
            {t("connection.type")}
            <select
              value={form.adapter}
              onChange={(event) =>
                changeAdapter(event.target.value as AdapterId)
              }
            >
              <option value="etcd">etcd</option>
              <option value="zookeeper">ZooKeeper</option>
              <option value="nacos">Nacos</option>
            </select>
          </label>
          <label>
            {t("connection.environment")}
            <select
              value={form.environment}
              onChange={(event) =>
                onChange({
                  ...form,
                  environment: event.target.value as ConnectionEnvironment,
                })
              }
            >
              {(
                [
                  "unspecified",
                  "development",
                  "testing",
                  "staging",
                  "production",
                ] as const
              ).map((value) => (
                <option value={value} key={value}>
                  {connectionEnvironmentLabel(locale, value)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {t("connection.name")}
          <input
            autoFocus
            value={form.name}
            onChange={(event) =>
              onChange({ ...form, name: event.target.value })
            }
            placeholder={t("connection.namePlaceholder")}
          />
        </label>
        <label>
          Endpoint
          <input
            value={form.endpoint}
            onChange={(event) =>
              onChange({ ...form, endpoint: event.target.value })
            }
            placeholder={
              endpointPlaceholder ? t(endpointPlaceholder) : "127.0.0.1:8848"
            }
          />
        </label>

        {form.adapter === "nacos" && (
          <div className="form-grid">
            <label>
              Namespace
              <input
                value={form.namespace}
                onChange={(event) =>
                  onChange({ ...form, namespace: event.target.value })
                }
                placeholder="public"
              />
            </label>
            <label>
              Admin API
              <select
                value={form.nacosApiVersion}
                onChange={(event) =>
                  onChange({
                    ...form,
                    nacosApiVersion: event.target.value as "v2" | "v3",
                  })
                }
              >
                <option value="v2">Nacos 2.x</option>
                <option value="v3">Nacos 3.x</option>
              </select>
            </label>
          </div>
        )}

        <div className="form-section">
          <div className="form-section-title">
            {t("connection.authentication")}
          </div>
          <label>
            {t("connection.authMethod")}
            <select
              value={form.auth.mode}
              onChange={(event) =>
                changeAuthMode(event.target.value as AuthenticationMode)
              }
            >
              {authModes(form.adapter).map((mode) => (
                <option value={mode} key={mode}>
                  {authModeLabel(mode, t)}
                </option>
              ))}
            </select>
          </label>
          {authenticated && form.auth.mode !== "custom" && (
            <div className="form-grid equal">
              <label>
                {form.auth.mode === "mseAccessKey"
                  ? "AccessKey ID"
                  : t("connection.username")}
                <input
                  value={form.auth.username}
                  onChange={(event) =>
                    onChange({
                      ...form,
                      auth: { ...form.auth, username: event.target.value },
                    })
                  }
                  autoComplete="off"
                />
              </label>
              <label>
                {form.auth.mode === "digest"
                  ? t("connection.digestPassword")
                  : form.auth.mode === "mseAccessKey"
                    ? "AccessKey Secret"
                    : t("connection.password")}
                <input
                  type="password"
                  value={secret}
                  onChange={(event) => onSecretChange(event.target.value)}
                  autoComplete="new-password"
                  placeholder={
                    mode === "edit"
                      ? form.auth.mode === "mseAccessKey"
                        ? t("connection.keepAccessKey")
                        : t("connection.keepPassword")
                      : t("connection.storeInVault")
                  }
                />
              </label>
            </div>
          )}
          {form.auth.mode === "custom" && (
            <div className="form-grid equal">
              <label>
                {t("connection.customKey")}
                <input
                  value={form.auth.customKey}
                  onChange={(event) =>
                    onChange({
                      ...form,
                      auth: { ...form.auth, customKey: event.target.value },
                    })
                  }
                  placeholder={t("connection.customKeyPlaceholder")}
                />
              </label>
              <label>
                {t("connection.customSecret")}
                <input
                  type="password"
                  value={secret}
                  onChange={(event) => onSecretChange(event.target.value)}
                  autoComplete="new-password"
                  placeholder={
                    mode === "edit"
                      ? t("connection.keepSecret")
                      : t("connection.storeInVault")
                  }
                />
              </label>
            </div>
          )}
          <p className="form-note">{t("connection.credentialHelp")}</p>
        </div>

        {supportsTls && (
          <div className="form-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.tls.enabled}
                onChange={(event) =>
                  onChange({
                    ...form,
                    tls: { ...form.tls, enabled: event.target.checked },
                  })
                }
              />
              {t("connection.enableTls")}
            </label>
            {form.tls.enabled && (
              <>
                <label>
                  {t("connection.caPath")}
                  <input
                    value={form.tls.caCertificatePath}
                    onChange={(event) =>
                      onChange({
                        ...form,
                        tls: {
                          ...form.tls,
                          caCertificatePath: event.target.value,
                        },
                      })
                    }
                    placeholder={
                      form.adapter === "zookeeper"
                        ? t("connection.caRequired")
                        : t("connection.caSystem")
                    }
                  />
                </label>
                <div className="form-grid equal">
                  <label>
                    {t("connection.clientCertificate")}
                    <input
                      value={form.tls.clientCertificatePath}
                      onChange={(event) =>
                        onChange({
                          ...form,
                          tls: {
                            ...form.tls,
                            clientCertificatePath: event.target.value,
                          },
                        })
                      }
                      placeholder={t("connection.clientCertificateHelp")}
                    />
                  </label>
                  <label>
                    {t("connection.clientKey")}
                    <input
                      value={form.tls.clientKeyPath}
                      onChange={(event) =>
                        onChange({
                          ...form,
                          tls: {
                            ...form.tls,
                            clientKeyPath: event.target.value,
                          },
                        })
                      }
                      placeholder={t("connection.clientKeyHelp")}
                    />
                  </label>
                </div>
                {form.adapter === "etcd" && (
                  <label>
                    Server Name
                    <input
                      value={form.tls.serverName}
                      onChange={(event) =>
                        onChange({
                          ...form,
                          tls: { ...form.tls, serverName: event.target.value },
                        })
                      }
                      placeholder={t("connection.serverNameHelp")}
                    />
                  </label>
                )}
              </>
            )}
          </div>
        )}

        {form.adapter === "etcd" && (
          <div className="form-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.sshTunnel.enabled}
                onChange={(event) => {
                  if (!event.target.checked) onSshSecretChange("");
                  onChange({
                    ...form,
                    sshTunnel: {
                      ...form.sshTunnel,
                      enabled: event.target.checked,
                    },
                  });
                }}
              />
              {t("connection.enableSshTunnel")}
            </label>
            {form.sshTunnel.enabled && (
              <>
                <div className="form-grid equal">
                  <label>
                    {t("connection.sshHost")}
                    <input
                      value={form.sshTunnel.host}
                      onChange={(event) =>
                        onChange({
                          ...form,
                          sshTunnel: {
                            ...form.sshTunnel,
                            host: event.target.value,
                          },
                        })
                      }
                      placeholder="bastion.example.com"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    {t("connection.sshPort")}
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      value={form.sshTunnel.port}
                      onChange={(event) =>
                        onChange({
                          ...form,
                          sshTunnel: {
                            ...form.sshTunnel,
                            port: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                </div>
                <div className="form-grid equal">
                  <label>
                    {t("connection.sshUsername")}
                    <input
                      value={form.sshTunnel.username}
                      onChange={(event) =>
                        onChange({
                          ...form,
                          sshTunnel: {
                            ...form.sshTunnel,
                            username: event.target.value,
                          },
                        })
                      }
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    {t("connection.sshAuthentication")}
                    <select
                      value={form.sshTunnel.authentication}
                      onChange={(event) => {
                        onSshSecretChange("");
                        onChange({
                          ...form,
                          sshTunnel: {
                            ...form.sshTunnel,
                            authentication: event.target
                              .value as SshAuthenticationMode,
                            privateKeyPath: "",
                          },
                        });
                      }}
                    >
                      <option value="password">
                        {t("connection.sshPassword")}
                      </option>
                      <option value="privateKey">
                        {t("connection.sshPrivateKey")}
                      </option>
                    </select>
                  </label>
                </div>
                {form.sshTunnel.authentication === "privateKey" && (
                  <label>
                    {t("connection.sshPrivateKeyPath")}
                    <input
                      value={form.sshTunnel.privateKeyPath}
                      onChange={(event) =>
                        onChange({
                          ...form,
                          sshTunnel: {
                            ...form.sshTunnel,
                            privateKeyPath: event.target.value,
                          },
                        })
                      }
                      placeholder="/Users/me/.ssh/id_ed25519"
                    />
                  </label>
                )}
                <label>
                  {form.sshTunnel.authentication === "password"
                    ? t("connection.sshPassword")
                    : t("connection.sshKeyPassphrase")}
                  <input
                    type="password"
                    value={sshSecret}
                    onChange={(event) => onSshSecretChange(event.target.value)}
                    autoComplete="new-password"
                    placeholder={
                      mode === "edit"
                        ? t("connection.sshKeepSecret")
                        : form.sshTunnel.authentication === "privateKey"
                          ? t("connection.sshPassphraseOptional")
                          : t("connection.storeInVault")
                    }
                  />
                </label>
                <label>
                  {t("connection.sshHostKeyFingerprint")}
                  <input
                    value={form.sshTunnel.hostKeyFingerprint}
                    onChange={(event) =>
                      onChange({
                        ...form,
                        sshTunnel: {
                          ...form.sshTunnel,
                          hostKeyFingerprint: event.target.value,
                        },
                      })
                    }
                    placeholder="SHA256:..."
                    autoComplete="off"
                  />
                </label>
                <p className="form-note">{t("connection.sshTunnelHelp")}</p>
              </>
            )}
          </div>
        )}

        {form.environment === "production" && (
          <div className="mutation-warning">
            {t("connection.productionWarning")}
          </div>
        )}
        <div className="dialog-actions split-actions">
          <div>
            {mode === "edit" && (
              <button
                className="button danger"
                disabled={busy}
                onClick={onDelete}
              >
                {t("connection.delete")}
              </button>
            )}
          </div>
          <div className="action-group">
            <button
              className="button"
              onClick={testing ? onCancelOperation : onCancel}
            >
              {testing ? t("connection.cancelTest") : t("common.cancel")}
            </button>
            <button className="button" disabled={busy} onClick={onTest}>
              {t("connection.test")}
            </button>
            <button className="button primary" disabled={busy} onClick={onSave}>
              {t("connection.saveAndConnect")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function authModeLabel(mode: AuthenticationMode, t: Translator) {
  switch (mode) {
    case "none":
      return t("connection.authNone");
    case "usernamePassword":
      return t("connection.authUsernamePassword");
    case "digest":
      return "Digest";
    case "custom":
      return t("connection.authCustom");
    case "mseAccessKey":
      return t("connection.authMse");
  }
}
