import type { ConnectionProfile, CredentialUpdate } from "./registry";

export function planSshCredential(
  candidate: ConnectionProfile,
  stored: ConnectionProfile | undefined,
  secret: string,
): {
  missingPassword: boolean;
  update: CredentialUpdate;
  transient: string | undefined;
} {
  const tunnel = candidate.sshTunnel;
  const preserve = Boolean(
    stored?.id === candidate.id &&
    stored.sshTunnel.enabled &&
    stored.sshTunnel.authentication === tunnel.authentication &&
    (tunnel.authentication !== "privateKey" ||
      stored.sshTunnel.privateKeyPath.trim() === tunnel.privateKeyPath),
  );
  return {
    missingPassword:
      tunnel.enabled &&
      tunnel.authentication === "password" &&
      !secret &&
      !preserve,
    update: !tunnel.enabled
      ? { operation: "clear" }
      : secret
        ? { operation: "replace", secret }
        : preserve
          ? { operation: "preserve" }
          : { operation: "clear" },
    // 空字符串明确表示本次不使用已保存口令；undefined 才允许凭据库回退。
    transient: tunnel.enabled
      ? secret || (preserve ? undefined : "")
      : undefined,
  };
}
