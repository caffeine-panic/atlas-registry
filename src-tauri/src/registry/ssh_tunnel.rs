use std::{fmt, net::Ipv4Addr, str::FromStr, sync::Arc, time::Duration};

use russh::{
    Disconnect, client,
    keys::{HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate, ssh_key::Fingerprint},
};
use tokio::{
    io::{AsyncReadExt, copy_bidirectional},
    net::{TcpListener, TcpStream},
    task::{AbortHandle, JoinSet},
};
use tokio_util::sync::CancellationToken;
use url::Url;
use zeroize::Zeroizing;

use crate::{
    credentials::ConnectionSecret,
    registry::{ConnectionProfile, RegistryError, SshAuthenticationMode},
};

const SSH_INACTIVITY_TIMEOUT: Duration = Duration::from_secs(20);
const SSH_KEEPALIVE_INTERVAL: Duration = Duration::from_secs(10);
const MAX_ACTIVE_FORWARD_CHANNELS: usize = 32;
const MAX_PRIVATE_KEY_BYTES: u64 = 64 * 1024;

#[derive(Clone)]
pub(super) struct ManagedSshTunnel {
    _inner: Arc<TunnelInner>,
    local_port: u16,
    remote: RemoteTarget,
}

struct TunnelInner {
    cancel: CancellationToken,
    abort: AbortHandle,
}

impl Drop for TunnelInner {
    fn drop(&mut self) {
        self.cancel.cancel();
        self.abort.abort();
    }
}

impl ManagedSshTunnel {
    pub(super) async fn open(
        profile: &ConnectionProfile,
        secret: Option<Arc<ConnectionSecret>>,
    ) -> Result<Self, RegistryError> {
        let remote = RemoteTarget::parse(&profile.endpoint, profile.tls.enabled)?;
        let expected_fingerprint = Fingerprint::from_str(&profile.ssh_tunnel.host_key_fingerprint)
            .map_err(|_| {
                RegistryError::validation(
                    "SSH host key fingerprint must use the SHA256:<base64> format",
                )
            })?;
        let handler = PinnedHostKey {
            expected: expected_fingerprint,
        };
        let config = Arc::new(client::Config {
            inactivity_timeout: Some(SSH_INACTIVITY_TIMEOUT),
            keepalive_interval: Some(SSH_KEEPALIVE_INTERVAL),
            keepalive_max: 3,
            nodelay: true,
            ..Default::default()
        });
        let mut ssh = client::connect(
            config,
            (profile.ssh_tunnel.host.as_str(), profile.ssh_tunnel.port),
            handler,
        )
        .await
        .map_err(map_connect_error)?;

        let authenticated = match profile.ssh_tunnel.authentication {
            SshAuthenticationMode::Password => {
                let password = secret.as_deref().ok_or_else(|| {
                    RegistryError::credential_missing("SSH password is unavailable")
                })?;
                ssh.authenticate_password(
                    profile.ssh_tunnel.username.clone(),
                    password.expose().to_owned(),
                )
                .await
            }
            SshAuthenticationMode::PrivateKey => {
                let key_path = profile.ssh_tunnel.private_key_path.clone();
                let passphrase = secret.clone();
                let metadata = tokio::fs::metadata(&key_path).await.map_err(|_| {
                    RegistryError::permission_denied("SSH private key is unavailable")
                })?;
                if !metadata.is_file() || metadata.len() > MAX_PRIVATE_KEY_BYTES {
                    return Err(RegistryError::validation(
                        "SSH private key must be a regular file no larger than 64 KiB",
                    ));
                }
                let file = tokio::fs::File::open(&key_path).await.map_err(|_| {
                    RegistryError::permission_denied("SSH private key is unavailable")
                })?;
                let mut encoded = Zeroizing::new(String::new());
                file.take(MAX_PRIVATE_KEY_BYTES + 1)
                    .read_to_string(&mut encoded)
                    .await
                    .map_err(|_| {
                        RegistryError::permission_denied("SSH private key cannot be read")
                    })?;
                if encoded.len() as u64 > MAX_PRIVATE_KEY_BYTES {
                    return Err(RegistryError::validation("SSH private key exceeds 64 KiB"));
                }
                let key = tokio::task::spawn_blocking(move || {
                    russh::keys::decode_secret_key(
                        &encoded,
                        passphrase.as_deref().map(ConnectionSecret::expose),
                    )
                })
                .await
                .map_err(|_| RegistryError::permission_denied("SSH private key loading failed"))?
                .map_err(|_| {
                    RegistryError::permission_denied(
                        "SSH private key is invalid or its passphrase was rejected",
                    )
                })?;
                let rsa_hash = ssh
                    .best_supported_rsa_hash()
                    .await
                    .map_err(|_| RegistryError::network("SSH key negotiation failed"))?
                    .unwrap_or(Some(HashAlg::Sha256));
                ssh.authenticate_publickey(
                    profile.ssh_tunnel.username.clone(),
                    PrivateKeyWithHashAlg::new(Arc::new(key), rsa_hash),
                )
                .await
            }
        }
        .map_err(|_| RegistryError::permission_denied("SSH authentication failed"))?;
        if !authenticated.success() {
            return Err(RegistryError::permission_denied(
                "SSH authentication failed",
            ));
        }

        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .map_err(|_| RegistryError::network("cannot create the local SSH tunnel listener"))?;
        let local_port = listener
            .local_addr()
            .map_err(|_| RegistryError::network("cannot inspect the local SSH tunnel listener"))?
            .port();
        let cancel = CancellationToken::new();
        let task_cancel = cancel.clone();
        let task_remote = remote.clone();
        let task = tokio::spawn(async move {
            run_forwarder(listener, ssh, task_remote, task_cancel).await;
        });
        let abort = task.abort_handle();
        drop(task);
        Ok(Self {
            _inner: Arc::new(TunnelInner { cancel, abort }),
            local_port,
            remote,
        })
    }

    pub(super) fn local_etcd_endpoint(&self, tls: bool) -> String {
        let scheme = if tls { "https" } else { "http" };
        format!("{scheme}://127.0.0.1:{}", self.local_port)
    }

    pub(super) fn remote_host(&self) -> &str {
        &self.remote.host
    }
}

async fn run_forwarder(
    listener: TcpListener,
    ssh: client::Handle<PinnedHostKey>,
    remote: RemoteTarget,
    cancel: CancellationToken,
) {
    let ssh = Arc::new(ssh);
    let mut forwards = JoinSet::new();
    loop {
        tokio::select! {
            biased;
            () = cancel.cancelled() => break,
            Some(_) = forwards.join_next(), if !forwards.is_empty() => {},
            accepted = listener.accept() => {
                let Ok((stream, origin)) = accepted else { break };
                if forwards.len() >= MAX_ACTIVE_FORWARD_CHANNELS || ssh.is_closed() {
                    drop(stream);
                    continue;
                }
                let ssh = ssh.clone();
                let remote = remote.clone();
                let channel_cancel = cancel.clone();
                forwards.spawn(async move {
                    forward_connection(stream, origin.ip().to_string(), ssh, remote, channel_cancel).await;
                });
            }
        }
    }
    forwards.abort_all();
    while forwards.join_next().await.is_some() {}
    let _ = ssh
        .disconnect(Disconnect::ByApplication, "", "English")
        .await;
}

async fn forward_connection(
    mut stream: TcpStream,
    origin: String,
    ssh: Arc<client::Handle<PinnedHostKey>>,
    remote: RemoteTarget,
    cancel: CancellationToken,
) {
    let Ok(channel) = ssh
        .channel_open_direct_tcpip(remote.host, remote.port.into(), origin, 0)
        .await
    else {
        return;
    };
    let mut channel = channel.into_stream();
    tokio::select! {
        () = cancel.cancelled() => {},
        _ = copy_bidirectional(&mut stream, &mut channel) => {},
    }
}

#[derive(Clone)]
struct RemoteTarget {
    host: String,
    port: u16,
}

impl RemoteTarget {
    fn parse(endpoint: &str, tls: bool) -> Result<Self, RegistryError> {
        let endpoint = endpoint.trim();
        let parsed = if endpoint.contains("://") {
            Url::parse(endpoint)
        } else {
            Url::parse(&format!(
                "{}://{endpoint}",
                if tls { "https" } else { "http" }
            ))
        }
        .map_err(|_| RegistryError::validation("the tunneled etcd endpoint is invalid"))?;
        let expected_scheme = if tls { "https" } else { "http" };
        if parsed.scheme() != expected_scheme {
            return Err(RegistryError::validation(format!(
                "the tunneled etcd endpoint must use {expected_scheme} when TLS is configured"
            )));
        }
        if !parsed.username().is_empty() || parsed.password().is_some() {
            return Err(RegistryError::validation(
                "the tunneled etcd endpoint cannot contain credentials",
            ));
        }
        if parsed.path() != "/" || parsed.query().is_some() || parsed.fragment().is_some() {
            return Err(RegistryError::validation(
                "the tunneled etcd endpoint must contain only a host and port",
            ));
        }
        let host = match parsed.host() {
            Some(url::Host::Domain(host)) => host.to_owned(),
            Some(url::Host::Ipv4(host)) => host.to_string(),
            Some(url::Host::Ipv6(host)) => host.to_string(),
            None => {
                return Err(RegistryError::validation(
                    "the tunneled etcd endpoint has no host",
                ));
            }
        };
        // HTTP URL 会归一化显式的 80/443；使用无默认端口的 scheme 保留原始端口。
        let authority = endpoint
            .split_once("://")
            .map_or(endpoint, |(_, rest)| rest);
        let port = Url::parse(&format!("tcp://{authority}"))
            .map_err(|_| RegistryError::validation("the tunneled etcd endpoint is invalid"))?
            .port()
            .unwrap_or(2379);
        Ok(Self { host, port })
    }
}

#[derive(Debug)]
enum SshClientError {
    Protocol,
    HostKeyMismatch,
}

impl From<russh::Error> for SshClientError {
    fn from(_error: russh::Error) -> Self {
        Self::Protocol
    }
}

impl fmt::Display for SshClientError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Protocol => formatter.write_str("SSH protocol failure"),
            Self::HostKeyMismatch => formatter.write_str("SSH host key mismatch"),
        }
    }
}

impl std::error::Error for SshClientError {}

#[derive(Clone)]
struct PinnedHostKey {
    expected: Fingerprint,
}

impl client::Handler for PinnedHostKey {
    type Error = SshClientError;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let actual = server_public_key.public_key().fingerprint(HashAlg::Sha256);
        if actual == self.expected {
            Ok(true)
        } else {
            Err(SshClientError::HostKeyMismatch)
        }
    }
}

fn map_connect_error(error: SshClientError) -> RegistryError {
    match error {
        SshClientError::HostKeyMismatch => RegistryError::ssh_host_key(
            "SSH host key changed or does not match the pinned fingerprint",
        ),
        SshClientError::Protocol => RegistryError::network("SSH tunnel connection failed"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use russh::client::Handler as _;
    use tokio::io::AsyncWriteExt;

    struct TestBastion {
        address: std::net::SocketAddr,
        fingerprint: String,
        cancel: CancellationToken,
        task: tokio::task::JoinHandle<()>,
    }

    #[derive(Default)]
    struct TestHandler {
        forwards: JoinSet<()>,
    }

    impl russh::server::Handler for TestHandler {
        type Error = russh::Error;

        async fn auth_publickey(
            &mut self,
            user: &str,
            _key: &russh::keys::PublicKey,
        ) -> Result<russh::server::Auth, Self::Error> {
            Ok(if user == "fixture" {
                russh::server::Auth::Accept
            } else {
                russh::server::Auth::reject()
            })
        }

        async fn auth_password(
            &mut self,
            user: &str,
            password: &str,
        ) -> Result<russh::server::Auth, Self::Error> {
            Ok(if user == "fixture" && password == "fixture-secret" {
                russh::server::Auth::Accept
            } else {
                russh::server::Auth::reject()
            })
        }

        async fn channel_open_direct_tcpip(
            &mut self,
            channel: russh::Channel<russh::server::Msg>,
            host: &str,
            port: u32,
            _origin: &str,
            _origin_port: u32,
            reply: russh::server::ChannelOpenHandle,
            _session: &mut russh::server::Session,
        ) -> Result<(), Self::Error> {
            // 测试跳板只允许转发至本机的隔离服务。
            if host != "127.0.0.1" || port > u16::MAX.into() {
                return Ok(());
            }
            let mut target = TcpStream::connect((host, port as u16)).await?;
            reply.accept().await;
            self.forwards.spawn(async move {
                let _ = copy_bidirectional(&mut target, &mut channel.into_stream()).await;
            });
            Ok(())
        }
    }

    impl TestBastion {
        async fn start() -> Self {
            let key = russh::keys::PrivateKey::random(
                &mut russh::keys::key::safe_rng(),
                russh::keys::Algorithm::Ed25519,
            )
            .expect("fixture key");
            let fingerprint = key.public_key().fingerprint(HashAlg::Sha256).to_string();
            let config = Arc::new(russh::server::Config {
                keys: vec![key],
                auth_rejection_time: Duration::from_millis(10),
                inactivity_timeout: Some(Duration::from_secs(30)),
                ..Default::default()
            });
            let listener = TcpListener::bind("127.0.0.1:0")
                .await
                .expect("fixture listener");
            let address = listener.local_addr().expect("fixture address");
            let cancel = CancellationToken::new();
            let task_cancel = cancel.clone();
            let task = tokio::spawn(async move {
                let mut sessions = JoinSet::new();
                loop {
                    tokio::select! {
                        () = task_cancel.cancelled() => break,
                        Some(_) = sessions.join_next(), if !sessions.is_empty() => {},
                        incoming = listener.accept() => {
                            let (stream, _) = incoming.expect("fixture accept");
                            let config = config.clone();
                            let cancel = task_cancel.clone();
                            sessions.spawn(async move {
                                let session = tokio::select! {
                                    () = cancel.cancelled() => return,
                                    result = russh::server::run_stream(config, stream, TestHandler::default()) => result,
                                };
                                if let Ok(mut session) = session {
                                    tokio::select! {
                                        _ = &mut session => {},
                                        () = cancel.cancelled() => {
                                            let _ = session.handle().disconnect(Disconnect::ByApplication, String::new(), String::new()).await;
                                            let _ = session.await;
                                        },
                                    }
                                }
                            });
                        },
                    }
                }
                while sessions.join_next().await.is_some() {}
            });
            Self {
                address,
                fingerprint,
                cancel,
                task,
            }
        }

        fn profile(&self, endpoint: String) -> ConnectionProfile {
            serde_json::from_value(serde_json::json!({
                "id": "ssh-fixture", "name": "SSH fixture", "adapter": "etcd",
                "endpoint": endpoint,
                "sshTunnel": {
                    "enabled": true, "host": "127.0.0.1", "port": self.address.port(),
                    "username": "fixture", "authentication": "password",
                    "hostKeyFingerprint": self.fingerprint,
                }
            }))
            .expect("fixture profile")
        }

        async fn stop(self) {
            self.cancel.cancel();
            tokio::time::timeout(Duration::from_secs(3), self.task)
                .await
                .expect("fixture shutdown bounded")
                .expect("fixture task");
        }
    }

    fn fixture_secret() -> Option<Arc<ConnectionSecret>> {
        Some(Arc::new(ConnectionSecret::new("fixture-secret")))
    }

    #[test]
    fn stalled_ssh_handshake_times_out_or_cancels_and_releases_socket() {
        use crate::{
            credentials::ConnectionCredentials,
            registry::{OperationId, RegistryErrorCode, RegistryService},
        };
        tauri::async_runtime::block_on(async {
            let bastion = TestBastion::start().await;
            for cancelled in [true, false] {
                let listener = TcpListener::bind("127.0.0.1:0")
                    .await
                    .expect("stalled listener");
                let mut profile = bastion.profile("127.0.0.1:2379".to_owned());
                profile.ssh_tunnel.port = listener.local_addr().expect("stalled address").port();
                let service = RegistryService::default();
                let operation = OperationId::new("stalled-ssh").expect("operation id");
                let running_service = service.clone();
                let running_operation = operation.clone();
                let task = tokio::spawn(async move {
                    running_service
                        .probe_with_credentials_cancellable(
                            running_operation,
                            profile,
                            ConnectionCredentials::new(
                                None,
                                Some(ConnectionSecret::new("fixture-secret")),
                            ),
                        )
                        .await
                });
                let (mut socket, _) = listener
                    .accept()
                    .await
                    .expect("stalled connection accepted");
                if cancelled {
                    assert!(service.cancel(&operation).await);
                }
                let error = tokio::time::timeout(Duration::from_secs(25), task)
                    .await
                    .expect("setup bounded")
                    .expect("probe task")
                    .expect_err("stalled setup fails");
                assert_eq!(
                    error.code,
                    if cancelled {
                        RegistryErrorCode::Cancelled
                    } else {
                        RegistryErrorCode::Timeout
                    }
                );
                let mut discarded = Vec::new();
                tokio::time::timeout(Duration::from_secs(3), socket.read_to_end(&mut discarded))
                    .await
                    .expect("setup socket released")
                    .expect("socket EOF");
                assert!(!service.cancel(&operation).await);
            }
            bastion.stop().await;
        });
    }

    #[test]
    fn ssh_transport_forwards_bytes_rejects_bad_credentials_and_closes_listener() {
        tauri::async_runtime::block_on(async {
            let bastion = TestBastion::start().await;
            let target = TcpListener::bind("127.0.0.1:0").await.expect("target");
            let profile = bastion.profile(target.local_addr().expect("target address").to_string());
            let echo = tokio::spawn(async move {
                let (mut stream, _) = target.accept().await.expect("target accept");
                let mut bytes = [0; 5];
                stream.read_exact(&mut bytes).await.expect("target read");
                stream.write_all(&bytes).await.expect("target echo");
            });
            let tunnel = ManagedSshTunnel::open(&profile, fixture_secret())
                .await
                .expect("SSH setup");
            let local_port = tunnel.local_port;
            let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, local_port))
                .await
                .expect("local connect");
            stream.write_all(b"hello").await.expect("forward write");
            let mut bytes = [0; 5];
            tokio::time::timeout(Duration::from_secs(3), stream.read_exact(&mut bytes))
                .await
                .expect("forward bounded")
                .expect("forward read");
            assert_eq!(&bytes, b"hello");
            echo.await.expect("echo task");
            drop(stream);
            let abort = tunnel._inner.abort.clone();
            drop(tunnel);
            tokio::time::timeout(Duration::from_secs(3), async {
                while !abort.is_finished() {
                    tokio::task::yield_now().await;
                }
            })
            .await
            .expect("listener cleanup bounded");
            assert!(
                TcpStream::connect((Ipv4Addr::LOCALHOST, local_port))
                    .await
                    .is_err()
            );

            let error = ManagedSshTunnel::open(
                &profile,
                Some(Arc::new(ConnectionSecret::new("wrong-secret"))),
            )
            .await
            .err()
            .expect("wrong password rejected");
            assert_eq!(
                error.code,
                crate::registry::RegistryErrorCode::PermissionDenied
            );
            assert!(!error.message.contains("wrong-secret"));
            let mut changed = profile.clone();
            changed.ssh_tunnel.host_key_fingerprint =
                "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".to_owned();
            let error = ManagedSshTunnel::open(&changed, fixture_secret())
                .await
                .err()
                .expect("changed key rejected");
            assert_eq!(error.code, crate::registry::RegistryErrorCode::SshHostKey);

            let client_key = russh::keys::PrivateKey::random(
                &mut russh::keys::key::safe_rng(),
                russh::keys::Algorithm::Ed25519,
            )
            .expect("client fixture key");
            let encrypted_key = client_key
                .encrypt(&mut russh::keys::key::safe_rng(), "key-passphrase")
                .expect("encrypt fixture key");
            let key_path = std::env::temp_dir().join(format!(
                "atlas-ssh-key-{}-{}",
                std::process::id(),
                bastion.address.port()
            ));
            tokio::fs::write(
                &key_path,
                encrypted_key
                    .to_openssh(russh::keys::ssh_key::LineEnding::LF)
                    .expect("encode key")
                    .as_bytes(),
            )
            .await
            .expect("write fixture key");
            let mut key_profile = profile.clone();
            key_profile.ssh_tunnel.authentication = SshAuthenticationMode::PrivateKey;
            key_profile.ssh_tunnel.private_key_path = key_path.to_string_lossy().into_owned();
            let key_result = ManagedSshTunnel::open(
                &key_profile,
                Some(Arc::new(ConnectionSecret::new("key-passphrase"))),
            )
            .await;
            let wrong_passphrase = ManagedSshTunnel::open(
                &key_profile,
                Some(Arc::new(ConnectionSecret::new("wrong-passphrase"))),
            )
            .await;
            tokio::fs::remove_file(key_path)
                .await
                .expect("remove fixture key");
            drop(key_result.expect("encrypted private key authenticates"));
            let error = wrong_passphrase.err().expect("wrong passphrase rejected");
            assert_eq!(
                error.code,
                crate::registry::RegistryErrorCode::PermissionDenied
            );
            assert!(!error.message.contains("wrong-passphrase"));
            bastion.stop().await;
        });
    }

    #[test]
    #[ignore = "requires isolated ATLAS_TEST_ETCD_ENDPOINT"]
    fn managed_bastion_can_probe_browse_reconnect_and_close_real_etcd() {
        use crate::{
            credentials::ConnectionCredentials,
            registry::{RegistryService, ResourceAddress},
        };
        tauri::async_runtime::block_on(async {
            let bastion = TestBastion::start().await;
            let profile = bastion.profile(
                std::env::var("ATLAS_TEST_ETCD_ENDPOINT").expect("isolated etcd endpoint"),
            );
            let service = RegistryService::default();
            for _ in 0..2 {
                service
                    .probe_with_credentials_cancellable(
                        crate::registry::OperationId::new("ssh-live-probe").expect("probe id"),
                        profile.clone(),
                        ConnectionCredentials::new(
                            None,
                            Some(ConnectionSecret::new("fixture-secret")),
                        ),
                    )
                    .await
                    .expect("probe real etcd through SSH");
                let credentials =
                    ConnectionCredentials::new(None, Some(ConnectionSecret::new("fixture-secret")));
                let session = service
                    .open_with_credentials(profile.clone(), credentials)
                    .await
                    .expect("real etcd through SSH");
                service
                    .list(&session.id, ResourceAddress::Root, None, 100)
                    .await
                    .expect("browse through SSH");
                service
                    .close(&session.id)
                    .await
                    .expect("close tunnel session");
            }
            bastion.stop().await;
        });
    }

    #[test]
    fn tunneled_etcd_targets_are_single_bounded_host_ports() {
        let plain =
            RemoteTarget::parse("etcd.internal:2379", false).expect("plain endpoint should parse");
        assert_eq!(plain.host, "etcd.internal");
        assert_eq!(plain.port, 2379);

        let default_port =
            RemoteTarget::parse("etcd.internal", false).expect("default port should parse");
        assert_eq!(default_port.port, 2379);
        assert_eq!(
            RemoteTarget::parse("http://127.0.0.1:80", false)
                .expect("explicit port")
                .port,
            80
        );
        assert_eq!(
            RemoteTarget::parse("https://127.0.0.1:443", true)
                .expect("explicit TLS port")
                .port,
            443
        );
        assert_eq!(
            RemoteTarget::parse("[::1]:2379", false)
                .expect("IPv6 target")
                .host,
            "::1"
        );

        let tls = RemoteTarget::parse("https://etcd.internal:42379", true)
            .expect("TLS endpoint should parse");
        assert_eq!(tls.host, "etcd.internal");
        assert_eq!(tls.port, 42379);

        assert!(RemoteTarget::parse("etcd.internal:2379/path", false).is_err());
        assert!(RemoteTarget::parse("https://etcd.internal:2379", false).is_err());
        assert!(RemoteTarget::parse("user:secret@etcd.internal:2379", false).is_err());
    }

    #[test]
    fn a_mismatched_host_key_is_never_accepted() {
        let first = russh::keys::PrivateKey::random(
            &mut russh::keys::key::safe_rng(),
            russh::keys::Algorithm::Ed25519,
        )
        .expect("test key should generate");
        let second = russh::keys::PrivateKey::random(
            &mut russh::keys::key::safe_rng(),
            russh::keys::Algorithm::Ed25519,
        )
        .expect("test key should generate");
        let expected = first.public_key().fingerprint(HashAlg::Sha256);
        let mut handler = PinnedHostKey { expected };
        let presented = PublicKeyOrCertificate::from(second.public_key().clone());
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("test runtime should build");
        let result = runtime.block_on(handler.check_server_key(&presented));
        assert!(matches!(result, Err(SshClientError::HostKeyMismatch)));
    }

    #[test]
    fn dropping_the_last_tunnel_guard_cancels_and_aborts_its_task() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("test runtime should build");
        runtime.block_on(async {
            let cancel = CancellationToken::new();
            let task_cancel = cancel.clone();
            let task = tokio::spawn(async move {
                task_cancel.cancelled().await;
                std::future::pending::<()>().await;
            });
            let abort = task.abort_handle();
            let guard = Arc::new(TunnelInner {
                cancel,
                abort: abort.clone(),
            });

            drop(guard);
            let result = task.await;
            assert!(result.is_err_and(|error| error.is_cancelled()));
            assert!(abort.is_finished());
        });
    }
}
