use std::{fmt, sync::Arc};

use serde::Deserialize;
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

use crate::registry::{
    AuthenticationMode, ConnectionProfile, RegistryError, SshAuthenticationMode,
};

const KEYRING_SERVICE: &str = "dev.oneaday.atlas-registry";

#[derive(Clone)]
pub struct CredentialVault {
    backend: Arc<dyn CredentialBackend>,
}

impl CredentialVault {
    pub fn new(backend: Arc<dyn CredentialBackend>) -> Self {
        Self { backend }
    }

    pub fn system() -> Self {
        Self::new(Arc::new(SystemCredentialBackend))
    }

    pub async fn apply(
        &self,
        connection_id: &str,
        update: CredentialUpdate,
    ) -> Result<(), RegistryError> {
        self.apply_kind(connection_id, CredentialKind::Registry, update)
            .await
    }

    pub(crate) async fn apply_ssh(
        &self,
        connection_id: &str,
        update: CredentialUpdate,
    ) -> Result<(), RegistryError> {
        self.apply_kind(connection_id, CredentialKind::Ssh, update)
            .await
    }

    async fn apply_kind(
        &self,
        connection_id: &str,
        kind: CredentialKind,
        mut update: CredentialUpdate,
    ) -> Result<(), RegistryError> {
        let key = credential_key(connection_id, kind)?;
        match &mut update {
            CredentialUpdate::Preserve => Ok(()),
            CredentialUpdate::Replace { secret } => {
                if secret.is_empty() {
                    return Err(RegistryError::validation(
                        "credential replacement cannot be empty",
                    ));
                }
                self.write_key(key, Zeroizing::new(std::mem::take(secret)))
                    .await
            }
            CredentialUpdate::Clear => self.delete_key(key).await,
        }
    }

    pub async fn optional(
        &self,
        connection_id: &str,
    ) -> Result<Option<ConnectionSecret>, RegistryError> {
        self.optional_kind(connection_id, CredentialKind::Registry)
            .await
    }

    pub(crate) async fn optional_ssh(
        &self,
        connection_id: &str,
    ) -> Result<Option<ConnectionSecret>, RegistryError> {
        self.optional_kind(connection_id, CredentialKind::Ssh).await
    }

    async fn optional_kind(
        &self,
        connection_id: &str,
        kind: CredentialKind,
    ) -> Result<Option<ConnectionSecret>, RegistryError> {
        let key = credential_key(connection_id, kind)?;
        let backend = self.backend.clone();
        tokio::task::spawn_blocking(move || backend.read(&key))
            .await
            .map_err(|error| {
                RegistryError::credential_store(format!("system credential task failed: {error}"))
            })?
            .map(|secret| secret.map(ConnectionSecret))
            .map_err(map_backend_error)
    }

    pub async fn required(&self, connection_id: &str) -> Result<ConnectionSecret, RegistryError> {
        self.optional(connection_id).await?.ok_or_else(|| {
            RegistryError::credential_missing(format!(
                "connection '{connection_id}' has no secret in the system credential store"
            ))
        })
    }

    pub async fn resolve(
        &self,
        profile: &ConnectionProfile,
        transient: Option<TransientCredential>,
    ) -> Result<ConnectionCredentials, RegistryError> {
        let (transient_registry, transient_ssh) = transient
            .map(TransientCredential::into_secrets)
            .unwrap_or_default();
        let registry = if profile.auth.mode == AuthenticationMode::None {
            None
        } else {
            match transient_registry {
                Some(secret) if !secret.expose().is_empty() => Some(secret),
                Some(_) => {
                    return Err(RegistryError::validation(
                        "connection credential cannot be empty",
                    ));
                }
                None => Some(self.required(&profile.id).await?),
            }
        };
        let ssh = if !profile.ssh_tunnel.enabled {
            None
        } else {
            match transient_ssh {
                Some(secret) if !secret.expose().is_empty() => Some(secret),
                Some(_)
                    if profile.ssh_tunnel.authentication == SshAuthenticationMode::PrivateKey =>
                {
                    None
                }
                Some(_) => {
                    return Err(RegistryError::validation("SSH credential cannot be empty"));
                }
                None if profile.ssh_tunnel.authentication == SshAuthenticationMode::Password => {
                    Some(self.optional_ssh(&profile.id).await?.ok_or_else(|| {
                        RegistryError::credential_missing(format!(
                            "connection '{}' has no SSH password in the system credential store",
                            profile.id
                        ))
                    })?)
                }
                None => self.optional_ssh(&profile.id).await?,
            }
        };
        Ok(ConnectionCredentials { registry, ssh })
    }

    pub async fn delete(&self, connection_id: &str) -> Result<(), RegistryError> {
        self.delete_key(credential_key(connection_id, CredentialKind::Registry)?)
            .await
    }

    pub(crate) async fn delete_ssh(&self, connection_id: &str) -> Result<(), RegistryError> {
        self.delete_key(credential_key(connection_id, CredentialKind::Ssh)?)
            .await
    }

    async fn write_key(&self, key: String, secret: Zeroizing<String>) -> Result<(), RegistryError> {
        let backend = self.backend.clone();
        tokio::task::spawn_blocking(move || backend.write(&key, secret.as_str()))
            .await
            .map_err(|error| {
                RegistryError::credential_store(format!("system credential task failed: {error}"))
            })?
            .map_err(map_backend_error)
    }

    async fn delete_key(&self, key: String) -> Result<(), RegistryError> {
        let backend = self.backend.clone();
        tokio::task::spawn_blocking(move || backend.delete(&key))
            .await
            .map_err(|error| {
                RegistryError::credential_store(format!("system credential task failed: {error}"))
            })?
            .map_err(map_backend_error)
    }
}

#[derive(Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(tag = "operation", rename_all = "camelCase")]
pub enum CredentialUpdate {
    Preserve,
    Replace { secret: String },
    Clear,
}

#[derive(Default, Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase")]
pub struct TransientCredential {
    #[serde(default)]
    secret: Option<String>,
    #[serde(default)]
    ssh_secret: Option<String>,
}

impl TransientCredential {
    pub fn new(secret: impl Into<String>) -> Self {
        Self {
            secret: Some(secret.into()),
            ssh_secret: None,
        }
    }

    pub fn with_ssh_secret(mut self, secret: impl Into<String>) -> Self {
        self.ssh_secret = Some(secret.into());
        self
    }

    fn into_secrets(mut self) -> (Option<ConnectionSecret>, Option<ConnectionSecret>) {
        (
            self.secret.take().map(ConnectionSecret::new),
            self.ssh_secret.take().map(ConnectionSecret::new),
        )
    }
}

impl CredentialUpdate {
    pub fn preserve() -> Self {
        Self::Preserve
    }

    pub fn replace(secret: impl Into<String>) -> Self {
        Self::Replace {
            secret: secret.into(),
        }
    }

    pub fn clear() -> Self {
        Self::Clear
    }

    pub fn is_preserve(&self) -> bool {
        matches!(self, Self::Preserve)
    }
}

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct ConnectionSecret(String);

impl ConnectionSecret {
    pub fn new(secret: impl Into<String>) -> Self {
        Self(secret.into())
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

#[derive(Default)]
pub struct ConnectionCredentials {
    pub(crate) registry: Option<ConnectionSecret>,
    pub(crate) ssh: Option<ConnectionSecret>,
}

impl ConnectionCredentials {
    pub fn new(registry: Option<ConnectionSecret>, ssh: Option<ConnectionSecret>) -> Self {
        Self { registry, ssh }
    }

    pub fn registry(&self) -> Option<&ConnectionSecret> {
        self.registry.as_ref()
    }

    pub fn ssh(&self) -> Option<&ConnectionSecret> {
        self.ssh.as_ref()
    }
}

#[derive(Clone, Copy)]
enum CredentialKind {
    Registry,
    Ssh,
}

pub trait CredentialBackend: Send + Sync {
    fn read(&self, key: &str) -> Result<Option<String>, CredentialBackendError>;
    fn write(&self, key: &str, secret: &str) -> Result<(), CredentialBackendError>;
    fn delete(&self, key: &str) -> Result<(), CredentialBackendError>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CredentialBackendError(String);

impl CredentialBackendError {
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl fmt::Display for CredentialBackendError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for CredentialBackendError {}

struct SystemCredentialBackend;

impl SystemCredentialBackend {
    fn entry(key: &str) -> Result<keyring::Entry, CredentialBackendError> {
        keyring::Entry::new(KEYRING_SERVICE, key).map_err(|error| {
            CredentialBackendError::new(format!("cannot open system credential entry: {error}"))
        })
    }
}

impl CredentialBackend for SystemCredentialBackend {
    fn read(&self, key: &str) -> Result<Option<String>, CredentialBackendError> {
        match Self::entry(key)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(CredentialBackendError::new(format!(
                "cannot read system credential: {error}"
            ))),
        }
    }

    fn write(&self, key: &str, secret: &str) -> Result<(), CredentialBackendError> {
        Self::entry(key)?.set_password(secret).map_err(|error| {
            CredentialBackendError::new(format!("cannot save system credential: {error}"))
        })
    }

    fn delete(&self, key: &str) -> Result<(), CredentialBackendError> {
        match Self::entry(key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(CredentialBackendError::new(format!(
                "cannot delete system credential: {error}"
            ))),
        }
    }
}

fn credential_key(connection_id: &str, kind: CredentialKind) -> Result<String, RegistryError> {
    let connection_id = connection_id.trim();
    if connection_id.is_empty() {
        return Err(RegistryError::validation(
            "connection id cannot be blank for credential access",
        ));
    }
    let suffix = match kind {
        CredentialKind::Registry => "secret",
        CredentialKind::Ssh => "ssh-secret",
    };
    Ok(format!("connection:{connection_id}:{suffix}"))
}

fn map_backend_error(error: CredentialBackendError) -> RegistryError {
    RegistryError::credential_store(error.to_string())
}
