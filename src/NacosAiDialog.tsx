import { useEffect, useState } from "react";
import { useRegistryOperations } from "./useRegistryOperations";
import {
  cancelOperation,
  errorMessage,
  getNacosAiCapability,
  listNacosAiAssets,
  readNacosAiAsset,
  type NacosAiAssetDetail,
  type NacosAiAssetKind,
  type NacosAiAssetSummary,
  type NacosAiCapability,
} from "./registry";

type Props = {
  connectionId: string;
  namespaceId: string;
  onClose: () => void;
};

const familyLabels: Record<NacosAiAssetKind, string> = {
  mcp: "MCP",
  prompt: "Prompt",
  skill: "Skill",
  a2a: "A2A Agent",
};

export function NacosAiDialog({ connectionId, namespaceId, onClose }: Props) {
  const [capability, setCapability] = useState<NacosAiCapability>();
  const [kind, setKind] = useState<NacosAiAssetKind>();
  const [items, setItems] = useState<NacosAiAssetSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [detail, setDetail] = useState<NacosAiAssetDetail>();
  const [busy, setBusy] = useState(true);
  const [localError, setLocalError] = useState<string>();
  const operations = useRegistryOperations<"ai">(
    crypto.randomUUID.bind(crypto),
    cancelOperation,
  );
  const runOperation = operations.run;
  const cancelTrackedOperation = operations.cancel;

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const detected = await runOperation("ai", (operationId) =>
        getNacosAiCapability(connectionId, operationId),
      );
      if (disposed) return;
      setCapability(detected);
      const first = detected.families[0];
      if (!first) return;
      const page = await runOperation("ai", (operationId) =>
        listNacosAiAssets(connectionId, first, operationId),
      );
      if (disposed) return;
      setKind(first);
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setTotalCount(page.totalCount);
    })()
      .catch((reason: unknown) => {
        if (!disposed) setLocalError(errorMessage(reason));
      })
      .finally(() => {
        if (!disposed) setBusy(false);
      });
    return () => {
      disposed = true;
      void cancelTrackedOperation("ai");
    };
  }, [cancelTrackedOperation, connectionId, runOperation]);

  const loadFamily = async (nextKind: NacosAiAssetKind) => {
    if (busy) return;
    setBusy(true);
    setLocalError(undefined);
    setDetail(undefined);
    try {
      const page = await runOperation("ai", (operationId) =>
        listNacosAiAssets(connectionId, nextKind, operationId),
      );
      setKind(nextKind);
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setTotalCount(page.totalCount);
    } catch (reason) {
      setLocalError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    if (busy || !kind || !nextCursor) return;
    setBusy(true);
    setLocalError(undefined);
    try {
      const page = await runOperation("ai", (operationId) =>
        listNacosAiAssets(connectionId, kind, operationId, nextCursor),
      );
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
      setTotalCount(page.totalCount);
    } catch (reason) {
      setLocalError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const inspect = async (item: NacosAiAssetSummary) => {
    if (busy) return;
    setBusy(true);
    setLocalError(undefined);
    try {
      setDetail(
        await runOperation("ai", (operationId) =>
          readNacosAiAsset(
            connectionId,
            {
              kind: item.kind,
              identifier: item.identifier,
              name: item.name,
              version: item.version,
            },
            operationId,
          ),
        ),
      );
    } catch (reason) {
      setLocalError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-label="Nacos AI Registry 只读浏览器"
        aria-modal="true"
        className="dialog nacos-native-dialog nacos-ai-dialog"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <h2>AI Registry</h2>
            <p className="form-note">
              只读 · namespace {namespaceId || "public"} · 不提供发布或变更操作
            </p>
          </div>
          <button className="icon-button" onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        {capability?.families.length ? (
          <div className="native-tabs" aria-label="AI Registry 资源类型">
            {capability.families.map((family) => (
              <button
                className={kind === family ? "active" : ""}
                disabled={busy}
                key={family}
                onClick={() => void loadFamily(family)}
              >
                {familyLabels[family]}
              </button>
            ))}
          </div>
        ) : null}

        {localError && <div className="form-error">{localError}</div>}
        {!busy && capability && !capability.available && (
          <div className="empty-state">
            当前服务器没有暴露可识别的 Nacos 3 AI Registry 只读端点。
          </div>
        )}

        {capability?.available && (
          <div className="native-management-grid">
            <div className="native-object-list">
              <div className="list-heading">
                <b>{kind ? familyLabels[kind] : "AI 资源"}</b>
                <span>
                  {totalCount === null
                    ? `${items.length} 已加载`
                    : `${items.length} / ${totalCount}`}
                </span>
              </div>
              {items.map((item) => (
                <button
                  className={
                    detail?.asset.identifier === item.identifier ? "active" : ""
                  }
                  disabled={busy}
                  key={`${item.kind}:${item.identifier}:${item.version ?? "latest"}`}
                  onClick={() => void inspect(item)}
                >
                  <b>{item.name}</b>
                  <span>
                    {item.version ?? "latest"}
                    {item.description ? ` · ${item.description}` : ""}
                  </span>
                </button>
              ))}
              {nextCursor && (
                <button
                  className="new-object"
                  disabled={busy}
                  onClick={() => void loadMore()}
                >
                  加载下一页
                </button>
              )}
              {!busy && items.length === 0 && (
                <div className="empty-state">当前类型没有资源。</div>
              )}
            </div>
            <div className="native-object-editor ai-metadata-view">
              {detail ? (
                <>
                  <h3>{detail.asset.name}</h3>
                  <dl className="impact-grid">
                    <dt>类型</dt>
                    <dd>{familyLabels[detail.asset.kind]}</dd>
                    <dt>ID</dt>
                    <dd>{detail.asset.identifier}</dd>
                    <dt>版本</dt>
                    <dd>{detail.asset.version ?? "latest"}</dd>
                    {detail.asset.description && (
                      <>
                        <dt>描述</dt>
                        <dd>{detail.asset.description}</dd>
                      </>
                    )}
                    {Object.entries(detail.asset.metadata).map(
                      ([key, value]) => (
                        <span className="ai-metadata-row" key={key}>
                          <dt>{key}</dt>
                          <dd>{value}</dd>
                        </span>
                      ),
                    )}
                  </dl>
                  <p className="form-note">
                    仅展示安全、限长的标量元数据；模板、工具定义、Skill
                    包及凭据不会进入界面。
                  </p>
                </>
              ) : (
                <div className="empty-state">
                  选择一个资源查看归一化元数据。
                </div>
              )}
            </div>
          </div>
        )}

        {busy && <div className="form-note">正在读取只读元数据…</div>}
      </section>
    </div>
  );
}
