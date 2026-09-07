use std::collections::BTreeMap;

use reqwest::{Method, StatusCode};
use serde::Deserialize;
use serde_json::{Map, Value};

use super::{
    NacosAiAssetDetail, NacosAiAssetKind, NacosAiAssetPage, NacosAiAssetRef, NacosAiAssetSummary,
    NacosAiCapability, NacosApiVersion, RegistryError, adapters::NacosSession,
};

const MAX_RESPONSE_BYTES: usize = 512 * 1024;
const MAX_PAGE_SIZE: usize = 100;
const MAX_METADATA_ENTRIES: usize = 32;
const MAX_METADATA_BYTES: usize = 16 * 1024;
const MAX_METADATA_VALUE_CHARS: usize = 1_024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Envelope {
    code: i64,
    data: Option<Value>,
}

pub(super) async fn capability(session: &NacosSession) -> Result<NacosAiCapability, RegistryError> {
    if session.api_version() != NacosApiVersion::V3 {
        return Ok(NacosAiCapability {
            available: false,
            read_only: true,
            families: Vec::new(),
        });
    }

    let mut families = Vec::new();
    for kind in [
        NacosAiAssetKind::Mcp,
        NacosAiAssetKind::Prompt,
        NacosAiAssetKind::Skill,
        NacosAiAssetKind::A2a,
    ] {
        if probe_family(session, kind).await? {
            families.push(kind);
        }
    }
    Ok(NacosAiCapability {
        available: !families.is_empty(),
        read_only: true,
        families,
    })
}

pub(super) async fn list_assets(
    session: &NacosSession,
    kind: NacosAiAssetKind,
    cursor: Option<String>,
    limit: usize,
) -> Result<NacosAiAssetPage, RegistryError> {
    require_v3(session)?;
    let page_size = limit.clamp(1, MAX_PAGE_SIZE);
    let page_no = decode_cursor(cursor)?;
    let data = request_data(
        session
            .native_request(Method::GET, list_path(kind))
            .query(&[
                ("namespaceId", session.namespace_id().to_owned()),
                ("search", "accurate".to_owned()),
                ("pageNo", page_no.to_string()),
                ("pageSize", page_size.to_string()),
            ]),
        kind,
        "asset list",
    )
    .await?;
    normalize_page(kind, data, page_no, page_size)
}

pub(super) async fn read_asset(
    session: &NacosSession,
    asset_ref: NacosAiAssetRef,
) -> Result<NacosAiAssetDetail, RegistryError> {
    require_v3(session)?;
    validate_ref(&asset_ref)?;
    let version = asset_ref.version.clone().unwrap_or_default();
    let data = request_data(
        session
            .native_request(Method::GET, detail_path(asset_ref.kind))
            .query(&[
                ("namespaceId", session.namespace_id().to_owned()),
                ("mcpId", asset_ref.identifier.clone()),
                ("mcpName", asset_ref.name.clone()),
                ("agentName", asset_ref.name.clone()),
                ("promptKey", asset_ref.name.clone()),
                ("skillName", asset_ref.name.clone()),
                ("name", asset_ref.name.clone()),
                ("version", version),
            ]),
        asset_ref.kind,
        "asset detail",
    )
    .await?;
    let mut asset = normalize_asset(
        asset_ref.kind,
        data.as_object().ok_or_else(|| {
            RegistryError::invalid_response("Nacos AI asset detail is not an object")
        })?,
    )?;
    if asset.identifier.is_empty() {
        asset.identifier = asset_ref.identifier;
    }
    if asset.name.is_empty() {
        asset.name = asset_ref.name;
    }
    if asset.version.is_none() {
        asset.version = asset_ref.version;
    }
    Ok(NacosAiAssetDetail {
        asset,
        read_only: true,
    })
}

fn require_v3(session: &NacosSession) -> Result<(), RegistryError> {
    if session.api_version() == NacosApiVersion::V3 {
        Ok(())
    } else {
        Err(RegistryError::unsupported(
            "Nacos AI Registry requires a Nacos v3 connection",
        ))
    }
}

async fn probe_family(
    session: &NacosSession,
    kind: NacosAiAssetKind,
) -> Result<bool, RegistryError> {
    let response = session
        .native_request(Method::GET, list_path(kind))
        .query(&[
            ("namespaceId", session.namespace_id()),
            ("search", "accurate"),
            ("pageNo", "1"),
            ("pageSize", "1"),
        ])
        .send()
        .await
        .map_err(|error| sanitized_transport_error(error, kind, "capability probe"))?;
    match response.status() {
        StatusCode::NOT_FOUND | StatusCode::METHOD_NOT_ALLOWED | StatusCode::NOT_IMPLEMENTED => {
            return Ok(false);
        }
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
            return Err(RegistryError::permission_denied(format!(
                "Nacos {} AI Registry capability requires read permission",
                family_label(kind)
            )));
        }
        _ => {}
    }
    let status = response.status();
    let body = read_bounded(response, kind, "capability probe").await?;
    if !status.is_success() {
        return Err(status_error(status, kind, "capability probe"));
    }
    let envelope: Envelope = serde_json::from_slice(&body).map_err(|_| {
        RegistryError::invalid_response(format!(
            "invalid Nacos {} AI Registry capability response",
            family_label(kind)
        ))
    })?;
    match envelope.code {
        0 | 200 => Ok(true),
        401 | 403 => Err(RegistryError::permission_denied(format!(
            "Nacos {} AI Registry capability requires read permission",
            family_label(kind)
        ))),
        404 | 405 | 501 => Ok(false),
        _ => Err(RegistryError::network(format!(
            "Nacos {} AI Registry capability probe was rejected",
            family_label(kind)
        ))),
    }
}

async fn request_data(
    request: reqwest::RequestBuilder,
    kind: NacosAiAssetKind,
    operation: &str,
) -> Result<Value, RegistryError> {
    let response = request
        .send()
        .await
        .map_err(|error| sanitized_transport_error(error, kind, operation))?;
    let status = response.status();
    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        return Err(RegistryError::permission_denied(format!(
            "Nacos {} AI Registry {operation} requires read permission",
            family_label(kind)
        )));
    }
    if status == StatusCode::NOT_FOUND || status == StatusCode::METHOD_NOT_ALLOWED {
        return Err(RegistryError::unsupported(format!(
            "Nacos {} AI Registry is not available on this server",
            family_label(kind)
        )));
    }
    let body = read_bounded(response, kind, operation).await?;
    if !status.is_success() {
        return Err(status_error(status, kind, operation));
    }
    decode_envelope(&body, kind, operation)
}

async fn read_bounded(
    mut response: reqwest::Response,
    kind: NacosAiAssetKind,
    operation: &str,
) -> Result<Vec<u8>, RegistryError> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(response_too_large(kind, operation));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| {
        RegistryError::invalid_response(format!(
            "cannot read Nacos {} AI Registry {operation} response",
            family_label(kind)
        ))
    })? {
        if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(response_too_large(kind, operation));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn decode_envelope(
    body: &[u8],
    kind: NacosAiAssetKind,
    operation: &str,
) -> Result<Value, RegistryError> {
    let envelope: Envelope = serde_json::from_slice(body).map_err(|_| {
        RegistryError::invalid_response(format!(
            "invalid Nacos {} AI Registry {operation} response",
            family_label(kind)
        ))
    })?;
    match envelope.code {
        0 | 200 => envelope.data.ok_or_else(|| {
            RegistryError::invalid_response(format!(
                "Nacos {} AI Registry {operation} response has no data",
                family_label(kind)
            ))
        }),
        401 | 403 => Err(RegistryError::permission_denied(format!(
            "Nacos {} AI Registry {operation} requires read permission",
            family_label(kind)
        ))),
        404 | 405 | 501 => Err(RegistryError::unsupported(format!(
            "Nacos {} AI Registry is not available on this server",
            family_label(kind)
        ))),
        _ => Err(RegistryError::network(format!(
            "Nacos {} AI Registry {operation} was rejected",
            family_label(kind)
        ))),
    }
}

fn normalize_page(
    kind: NacosAiAssetKind,
    data: Value,
    page_no: usize,
    page_size: usize,
) -> Result<NacosAiAssetPage, RegistryError> {
    let object = data.as_object().ok_or_else(|| {
        RegistryError::invalid_response("Nacos AI Registry page is not an object")
    })?;
    let items = ["pageItems", "items", "list"]
        .iter()
        .find_map(|key| object.get(*key).and_then(Value::as_array))
        .ok_or_else(|| RegistryError::invalid_response("Nacos AI Registry page has no items"))?;
    if items.len() > page_size || items.len() > MAX_PAGE_SIZE {
        return Err(RegistryError::resource_exhausted(
            "Nacos AI Registry page exceeds the requested item limit",
        ));
    }
    let normalized = items
        .iter()
        .map(|item| {
            normalize_asset(
                kind,
                item.as_object().ok_or_else(|| {
                    RegistryError::invalid_response("Nacos AI Registry item is not an object")
                })?,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    let total_count = number_field(object, &["totalCount", "total"]);
    let pages_available = number_field(object, &["pagesAvailable", "totalPages"]);
    let has_more = pages_available
        .map(|pages| page_no < pages as usize)
        .or_else(|| total_count.map(|total| page_no.saturating_mul(page_size) < total as usize))
        .unwrap_or(items.len() == page_size);
    Ok(NacosAiAssetPage {
        items: normalized,
        next_cursor: has_more.then(|| (page_no + 1).to_string()),
        total_count,
    })
}

fn normalize_asset(
    kind: NacosAiAssetKind,
    object: &Map<String, Value>,
) -> Result<NacosAiAssetSummary, RegistryError> {
    let name = string_field(
        object,
        &["name", "mcpName", "agentName", "promptKey", "skillName"],
    )
    .unwrap_or_default();
    let identifier = string_field(
        object,
        &[
            "id",
            "mcpId",
            "agentId",
            "promptKey",
            "skillId",
            "skillName",
        ],
    )
    .unwrap_or_else(|| name.clone());
    if name.is_empty() && identifier.is_empty() {
        return Err(RegistryError::invalid_response(
            "Nacos AI Registry item has no stable identity",
        ));
    }
    let name = if name.is_empty() {
        identifier.clone()
    } else {
        name
    };
    let description = string_field(object, &["description", "desc"])
        .map(|value| truncate_chars(&value, MAX_METADATA_VALUE_CHARS));
    let version = string_field(
        object,
        &[
            "version",
            "latestVersion",
            "latestPublishedVersion",
            "agentVersion",
            "skillVersion",
        ],
    );
    Ok(NacosAiAssetSummary {
        kind,
        identifier: truncate_chars(&identifier, 256),
        name: truncate_chars(&name, 256),
        version: version.map(|value| truncate_chars(&value, 128)),
        description,
        metadata: normalized_metadata(object)?,
    })
}

fn normalized_metadata(
    object: &Map<String, Value>,
) -> Result<BTreeMap<String, String>, RegistryError> {
    const SAFE_FIELDS: &[&str] = &[
        "namespaceId",
        "groupName",
        "type",
        "protocol",
        "protocolVersion",
        "frontProtocol",
        "status",
        "latest",
        "enabled",
        "enable",
        "published",
        "owner",
        "scope",
        "from",
        "registrationType",
        "createTime",
        "updateTime",
        "versionCount",
        "labelCount",
        "editingVersion",
        "reviewingVersion",
        "onlineCnt",
        "downloadCount",
        "writable",
        "transportType",
        "visibility",
    ];
    let mut metadata = BTreeMap::new();
    let mut bytes = 0usize;
    for key in SAFE_FIELDS {
        let Some(value) = object.get(*key).and_then(scalar_string) else {
            continue;
        };
        if metadata.len() >= MAX_METADATA_ENTRIES {
            return Err(RegistryError::resource_exhausted(
                "Nacos AI Registry metadata has too many fields",
            ));
        }
        let value = truncate_chars(&value, MAX_METADATA_VALUE_CHARS);
        bytes = bytes.saturating_add(key.len()).saturating_add(value.len());
        if bytes > MAX_METADATA_BYTES {
            return Err(RegistryError::resource_exhausted(
                "Nacos AI Registry metadata exceeds the IPC safety limit",
            ));
        }
        metadata.insert((*key).to_owned(), value);
    }
    Ok(metadata)
}

fn validate_ref(asset_ref: &NacosAiAssetRef) -> Result<(), RegistryError> {
    if asset_ref.identifier.trim().is_empty() || asset_ref.name.trim().is_empty() {
        return Err(RegistryError::validation(
            "Nacos AI asset identity cannot be blank",
        ));
    }
    if asset_ref.identifier.len() > 256
        || asset_ref.name.len() > 256
        || asset_ref
            .version
            .as_ref()
            .is_some_and(|value| value.len() > 128)
        || asset_ref.identifier.chars().any(char::is_control)
        || asset_ref.name.chars().any(char::is_control)
    {
        return Err(RegistryError::validation(
            "Nacos AI asset identity is invalid",
        ));
    }
    Ok(())
}

fn string_field(object: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| object.get(*key).and_then(scalar_string))
        .filter(|value| !value.trim().is_empty())
}

fn scalar_string(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        _ => None,
    }
}

fn number_field(object: &Map<String, Value>, keys: &[&str]) -> Option<u64> {
    keys.iter()
        .find_map(|key| object.get(*key).and_then(Value::as_u64))
}

fn decode_cursor(cursor: Option<String>) -> Result<usize, RegistryError> {
    let page_no = cursor
        .as_deref()
        .unwrap_or("1")
        .parse::<usize>()
        .map_err(|_| RegistryError::validation("Nacos AI Registry cursor is invalid"))?;
    if page_no == 0 || page_no > 1_000_000 {
        return Err(RegistryError::validation(
            "Nacos AI Registry cursor is invalid",
        ));
    }
    Ok(page_no)
}

const fn list_path(kind: NacosAiAssetKind) -> &'static str {
    match kind {
        NacosAiAssetKind::Mcp => "/nacos/v3/admin/ai/mcp/list",
        NacosAiAssetKind::Prompt => "/nacos/v3/admin/ai/prompt/list",
        NacosAiAssetKind::Skill => "/nacos/v3/admin/ai/skills/list",
        NacosAiAssetKind::A2a => "/nacos/v3/admin/ai/a2a/list",
    }
}

const fn detail_path(kind: NacosAiAssetKind) -> &'static str {
    match kind {
        NacosAiAssetKind::Mcp => "/nacos/v3/admin/ai/mcp",
        NacosAiAssetKind::Prompt => "/nacos/v3/admin/ai/prompt/metadata",
        NacosAiAssetKind::Skill => "/nacos/v3/admin/ai/skills",
        NacosAiAssetKind::A2a => "/nacos/v3/admin/ai/a2a",
    }
}

const fn family_label(kind: NacosAiAssetKind) -> &'static str {
    match kind {
        NacosAiAssetKind::Mcp => "MCP",
        NacosAiAssetKind::Prompt => "Prompt",
        NacosAiAssetKind::Skill => "Skill",
        NacosAiAssetKind::A2a => "A2A",
    }
}

fn truncate_chars(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

fn response_too_large(kind: NacosAiAssetKind, operation: &str) -> RegistryError {
    RegistryError::resource_exhausted(format!(
        "Nacos {} AI Registry {operation} response exceeds the {MAX_RESPONSE_BYTES}-byte safety limit",
        family_label(kind)
    ))
}

fn status_error(status: StatusCode, kind: NacosAiAssetKind, operation: &str) -> RegistryError {
    RegistryError::network(format!(
        "Nacos {} AI Registry {operation} returned HTTP {}",
        family_label(kind),
        status.as_u16()
    ))
}

fn sanitized_transport_error(
    error: reqwest::Error,
    kind: NacosAiAssetKind,
    operation: &str,
) -> RegistryError {
    let reason = if error.is_timeout() {
        "timed out"
    } else if error.is_connect() {
        "could not connect"
    } else {
        "transport failed"
    };
    RegistryError::network(format!(
        "Nacos {} AI Registry {operation} {reason}",
        family_label(kind)
    ))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn supported_fixture_is_normalized_and_schema_extensions_are_ignored() {
        let page = normalize_page(
            NacosAiAssetKind::Mcp,
            json!({
                "pageNumber": 1,
                "pagesAvailable": 2,
                "totalCount": 2,
                "pageItems": [{
                    "mcpId": "mcp-1",
                    "name": "weather",
                    "version": "1.2.0",
                    "description": "Weather tools",
                    "protocol": "stdio",
                    "futureField": {"ignored": true}
                }]
            }),
            1,
            1,
        )
        .expect("fixture should normalize");
        assert_eq!(page.items[0].identifier, "mcp-1");
        assert_eq!(
            page.items[0].metadata.get("protocol"),
            Some(&"stdio".to_owned())
        );
        assert_eq!(page.next_cursor.as_deref(), Some("2"));
        assert_eq!(page.total_count, Some(2));
    }

    #[test]
    fn authorization_and_missing_capability_envelopes_are_distinct() {
        let denied = decode_envelope(
            br#"{"code":403,"message":"secret material"}"#,
            NacosAiAssetKind::Prompt,
            "asset list",
        )
        .expect_err("authorization failure should be surfaced");
        assert_eq!(
            denied.code,
            super::super::RegistryErrorCode::PermissionDenied
        );
        assert!(!denied.message.contains("secret material"));

        let missing = decode_envelope(
            br#"{"code":404,"message":"missing"}"#,
            NacosAiAssetKind::Skill,
            "asset list",
        )
        .expect_err("missing family should be unsupported");
        assert_eq!(missing.code, super::super::RegistryErrorCode::Unsupported);
    }

    #[test]
    fn oversized_page_and_invalid_pagination_are_rejected() {
        let oversized = json!({
            "pageItems": [
                {"name": "one"},
                {"name": "two"}
            ]
        });
        assert!(normalize_page(NacosAiAssetKind::A2a, oversized, 1, 1).is_err());
        assert!(decode_cursor(Some("0".to_owned())).is_err());
        assert!(decode_cursor(Some("not-a-page".to_owned())).is_err());
    }

    #[test]
    fn payload_fields_never_cross_the_metadata_boundary() {
        let object = json!({
            "promptKey": "safe-name",
            "template": "TOP SECRET",
            "content": "TOP SECRET",
            "tools": [{"token": "TOP SECRET"}],
            "description": "visible",
            "status": "published"
        });
        let asset = normalize_asset(
            NacosAiAssetKind::Prompt,
            object.as_object().expect("fixture is an object"),
        )
        .expect("fixture should normalize");
        let serialized = serde_json::to_string(&asset).expect("asset should serialize");
        assert!(!serialized.contains("TOP SECRET"));
        assert_eq!(asset.metadata.get("status"), Some(&"published".to_owned()));
    }

    #[test]
    fn long_metadata_is_bounded_before_ipc() {
        let long = "x".repeat(MAX_METADATA_VALUE_CHARS + 100);
        let object = json!({"name": "skill", "status": long});
        let asset = normalize_asset(
            NacosAiAssetKind::Skill,
            object.as_object().expect("fixture is an object"),
        )
        .expect("long scalar metadata should be safely truncated");
        assert_eq!(
            asset.metadata["status"].chars().count(),
            MAX_METADATA_VALUE_CHARS
        );
    }
}
