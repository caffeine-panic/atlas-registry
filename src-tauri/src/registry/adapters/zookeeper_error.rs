use crate::registry::RegistryError;

pub(super) fn map_connection_error(error: zookeeper_client::Error) -> RegistryError {
    match error {
        zookeeper_client::Error::AuthFailed | zookeeper_client::Error::NoAuth => {
            RegistryError::permission_denied("ZooKeeper authentication was rejected")
        }
        zookeeper_client::Error::SessionExpired => {
            RegistryError::session_expired("ZooKeeper session expired during connection")
        }
        zookeeper_client::Error::Timeout => RegistryError::timeout("ZooKeeper connection"),
        _ => RegistryError::network("ZooKeeper connection failed"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::RegistryErrorCode;

    #[test]
    fn connection_failures_are_structured_and_redacted() {
        let cases = [
            (
                zookeeper_client::Error::AuthFailed,
                RegistryErrorCode::PermissionDenied,
                false,
            ),
            (
                zookeeper_client::Error::NoAuth,
                RegistryErrorCode::PermissionDenied,
                false,
            ),
            (
                zookeeper_client::Error::SessionExpired,
                RegistryErrorCode::SessionExpired,
                false,
            ),
            (
                zookeeper_client::Error::Timeout,
                RegistryErrorCode::Timeout,
                true,
            ),
            (
                zookeeper_client::Error::ConnectionLoss,
                RegistryErrorCode::Network,
                true,
            ),
        ];
        for (source, code, retryable) in cases {
            let error = map_connection_error(source);
            assert_eq!(error.code, code);
            assert_eq!(error.retryable, retryable);
        }
    }
}
