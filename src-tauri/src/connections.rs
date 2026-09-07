use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{
    credentials::{ConnectionSecret, CredentialUpdate, CredentialVault},
    registry::{AuthenticationMode, ConnectionProfile, RegistryError, SshAuthenticationMode},
};

const CONNECTION_FILE_VERSION: u32 = 3;

#[derive(Clone)]
pub struct ConnectionStore {
    path: PathBuf,
    credentials: CredentialVault,
}

impl ConnectionStore {
    pub fn new(path: PathBuf, credentials: CredentialVault) -> Self {
        Self { path, credentials }
    }

    pub async fn load(&self) -> Result<Vec<ConnectionProfile>, RegistryError> {
        load_profiles(&self.path).await
    }

    pub async fn upsert(
        &self,
        mut profile: ConnectionProfile,
        credential_update: CredentialUpdate,
        ssh_credential_update: CredentialUpdate,
    ) -> Result<Vec<ConnectionProfile>, RegistryError> {
        profile.validate()?;
        let previous_profiles = self.load().await?;
        let previous_secret = self.credentials.optional(&profile.id).await?;
        let previous_ssh_secret = self.credentials.optional_ssh(&profile.id).await?;
        let credential_update = if profile.auth.mode == AuthenticationMode::None {
            CredentialUpdate::clear()
        } else {
            if credential_update.is_preserve() && previous_secret.is_none() {
                return Err(RegistryError::credential_missing(format!(
                    "connection '{}' requires a secret before it can be saved",
                    profile.id
                )));
            }
            credential_update
        };
        let ssh_credential_update = if !profile.ssh_tunnel.enabled {
            CredentialUpdate::clear()
        } else if profile.ssh_tunnel.authentication == SshAuthenticationMode::Password
            && ssh_credential_update.is_preserve()
            && previous_ssh_secret.is_none()
        {
            return Err(RegistryError::credential_missing(format!(
                "connection '{}' requires an SSH password before it can be saved",
                profile.id
            )));
        } else {
            ssh_credential_update
        };

        let mut next_profiles = previous_profiles.clone();
        if let Some(existing) = next_profiles
            .iter_mut()
            .find(|existing| existing.id == profile.id)
        {
            *existing = profile.clone();
        } else {
            next_profiles.push(profile.clone());
        }

        write_profiles(&self.path, &next_profiles).await?;
        let credential_result = self.credentials.apply(&profile.id, credential_update).await;
        let ssh_credential_result = match credential_result {
            Ok(()) => {
                self.credentials
                    .apply_ssh(&profile.id, ssh_credential_update)
                    .await
            }
            Err(error) => Err(error),
        };
        if let Err(error) = ssh_credential_result {
            return Err(self
                .rollback(
                    &previous_profiles,
                    &profile.id,
                    previous_secret,
                    previous_ssh_secret,
                    error,
                )
                .await);
        }
        Ok(next_profiles)
    }

    pub async fn delete(
        &self,
        connection_id: &str,
    ) -> Result<Vec<ConnectionProfile>, RegistryError> {
        let connection_id = connection_id.trim();
        if connection_id.is_empty() {
            return Err(RegistryError::validation("connection id cannot be blank"));
        }
        let previous_profiles = self.load().await?;
        if !previous_profiles
            .iter()
            .any(|profile| profile.id == connection_id)
        {
            return Err(RegistryError::not_found(format!(
                "connection profile '{connection_id}' does not exist"
            )));
        }
        let previous_secret = self.credentials.optional(connection_id).await?;
        let previous_ssh_secret = self.credentials.optional_ssh(connection_id).await?;
        let next_profiles = previous_profiles
            .iter()
            .filter(|profile| profile.id != connection_id)
            .cloned()
            .collect::<Vec<_>>();
        write_profiles(&self.path, &next_profiles).await?;
        let credential_result = self.credentials.delete(connection_id).await;
        let ssh_credential_result = match credential_result {
            Ok(()) => self.credentials.delete_ssh(connection_id).await,
            Err(error) => Err(error),
        };
        if let Err(error) = ssh_credential_result {
            return Err(self
                .rollback(
                    &previous_profiles,
                    connection_id,
                    previous_secret,
                    previous_ssh_secret,
                    error,
                )
                .await);
        }
        Ok(next_profiles)
    }

    async fn rollback(
        &self,
        previous_profiles: &[ConnectionProfile],
        connection_id: &str,
        previous_secret: Option<ConnectionSecret>,
        previous_ssh_secret: Option<ConnectionSecret>,
        original_error: RegistryError,
    ) -> RegistryError {
        let profile_rollback = write_profiles(&self.path, previous_profiles).await;
        let credential_rollback =
            restore_secret(&self.credentials, connection_id, previous_secret, false).await;
        let ssh_credential_rollback =
            restore_secret(&self.credentials, connection_id, previous_ssh_secret, true).await;
        match (
            profile_rollback,
            credential_rollback,
            ssh_credential_rollback,
        ) {
            (Ok(()), Ok(()), Ok(())) => original_error,
            (profile_result, credential_result, ssh_credential_result) => {
                RegistryError::storage(format!(
                    "connection update failed: {}; rollback was incomplete (profile: {}; credential: {}; SSH credential: {})",
                    original_error.message,
                    rollback_status(profile_result),
                    rollback_status(credential_result),
                    rollback_status(ssh_credential_result),
                ))
            }
        }
    }
}

async fn restore_secret(
    credentials: &CredentialVault,
    connection_id: &str,
    previous: Option<ConnectionSecret>,
    ssh: bool,
) -> Result<(), RegistryError> {
    let update = previous.map_or_else(CredentialUpdate::clear, |secret| {
        CredentialUpdate::replace(secret.expose().to_owned())
    });
    if ssh {
        credentials.apply_ssh(connection_id, update).await
    } else {
        credentials.apply(connection_id, update).await
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredConnectionProfiles {
    version: u32,
    profiles: Vec<ConnectionProfile>,
}

async fn load_profiles(path: &Path) -> Result<Vec<ConnectionProfile>, RegistryError> {
    let bytes = match tokio::fs::read(path).await {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(RegistryError::storage(format!(
                "cannot read connection profiles: {error}"
            )));
        }
    };
    let mut stored =
        serde_json::from_slice::<StoredConnectionProfiles>(&bytes).map_err(|error| {
            RegistryError::storage(format!("connection profile file is invalid: {error}"))
        })?;
    if !matches!(stored.version, 1 | 2 | CONNECTION_FILE_VERSION) {
        return Err(RegistryError::storage(format!(
            "unsupported connection profile version {}",
            stored.version
        )));
    }
    for profile in &mut stored.profiles {
        profile.validate()?;
    }
    Ok(stored.profiles)
}

async fn write_profiles(path: &Path, profiles: &[ConnectionProfile]) -> Result<(), RegistryError> {
    let directory = path
        .parent()
        .ok_or_else(|| RegistryError::storage("connection profile path has no parent"))?;
    tokio::fs::create_dir_all(directory)
        .await
        .map_err(|error| {
            RegistryError::storage(format!(
                "cannot create application config directory: {error}"
            ))
        })?;
    let bytes = serde_json::to_vec_pretty(&StoredConnectionProfiles {
        version: CONNECTION_FILE_VERSION,
        profiles: profiles.to_vec(),
    })
    .map_err(|error| {
        RegistryError::storage(format!("cannot serialize connection profiles: {error}"))
    })?;
    tokio::fs::write(path, bytes).await.map_err(|error| {
        RegistryError::storage(format!("cannot save connection profiles: {error}"))
    })
}

fn rollback_status(result: Result<(), RegistryError>) -> String {
    match result {
        Ok(()) => "ok".to_owned(),
        Err(error) => error.message,
    }
}
