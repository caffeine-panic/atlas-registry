export type AppLocale = "en" | "zh-CN";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

const STORAGE_KEY = "atlas.locale";

export const messages = {
  "zh-CN": {
    "app.demoBadge": "合成演示 · 只读",
    "app.runtimeSynthetic": "合成数据 · {count} 个适配器",
    "app.runtimePreparing": "正在准备合成数据…",
    "app.runtimeRust": "Rust Core · {count} 个适配器",
    "app.runtimeStarting": "正在启动 Rust Core…",
    "app.exitDemo": "退出演示",
    "app.demo": "◇ 演示",
    "app.checkingUpdates": "检查中…",
    "app.updates": "⇩ 更新",
    "app.settings": "⚙ 设置",
    "app.diagnostics": "诊断包",
    "app.history": "历史",
    "app.newConnection": "＋ 新建连接",
    "common.cancel": "取消",
    "common.close": "关闭",
    "common.saveSettings": "保存设置",
    "common.previousPage": "上一页",
    "common.nextPage": "下一页",
    "common.unknown": "未知",
    "common.dismissNotice": "关闭提示",
    "settings.title": "设置",
    "settings.language": "界面语言",
    "settings.languageHelp": "语言偏好独立保存在本机，不进入连接配置或凭据库。",
    "settings.english": "English",
    "settings.chinese": "简体中文",
    "settings.updateNetwork": "应用更新网络",
    "settings.systemProxy": "跟随系统代理",
    "settings.systemProxyHelp":
      "macOS 和 Windows 读取系统 HTTP/HTTPS 代理；Linux 读取代理环境变量。",
    "settings.manualProxy": "手动设置",
    "settings.manualProxyHelp": "只用于检查和下载 Atlas Registry 更新。",
    "settings.noProxy": "不使用代理",
    "settings.noProxyHelp": "更新请求始终直连，忽略系统代理和代理环境变量。",
    "settings.saved": "应用设置已保存",
    "connection.new": "新建连接",
    "connection.edit": "编辑连接",
    "connection.copy": "复制连接",
    "connection.type": "类型",
    "connection.environment": "环境",
    "connection.name": "名称",
    "connection.namePlaceholder": "例如：生产配置中心",
    "connection.endpointEtcd": "127.0.0.1:2379 或 etcd-1:2379,etcd-2:2379",
    "connection.endpointZookeeper": "127.0.0.1:2181 或 zk-1:2181,zk-2:2181/app",
    "connection.authentication": "认证",
    "connection.authMethod": "认证方式",
    "connection.authNone": "无认证",
    "connection.authUsernamePassword": "用户名 / 密码",
    "connection.authCustom": "自定义上下文",
    "connection.authMse": "阿里云 MSE AccessKey",
    "connection.username": "用户名",
    "connection.password": "密码",
    "connection.digestPassword": "Digest 密码",
    "connection.customKey": "上下文键",
    "connection.customSecret": "上下文密钥",
    "connection.customKeyPlaceholder": "例如 accessToken",
    "connection.keepAccessKey": "留空表示保留原 AccessKey Secret",
    "connection.keepPassword": "留空表示保留原密码",
    "connection.keepSecret": "留空表示保留原密钥",
    "connection.storeInVault": "保存在系统凭据库",
    "connection.credentialHelp":
      "密钥只通过一次性 Tauri IPC 进入 Rust，并存入操作系统凭据库；连接配置文件与 WebView 状态不保存密钥。",
    "connection.enableTls": "启用 TLS",
    "connection.caPath": "CA 证书路径",
    "connection.caRequired": "/path/to/ca.pem（必填）",
    "connection.caSystem": "/path/to/ca.pem（留空使用系统根证书）",
    "connection.clientCertificate": "客户端证书路径",
    "connection.clientCertificateHelp": "可选，需与私钥同时配置",
    "connection.clientKey": "客户端私钥路径",
    "connection.clientKeyHelp": "可选；私钥内容只由 Rust 读取",
    "connection.serverNameHelp": "证书域名覆盖，可选",
    "connection.enableSshTunnel": "通过 SSH 隧道连接",
    "connection.sshHost": "SSH 跳板机",
    "connection.sshPort": "SSH 端口",
    "connection.sshUsername": "SSH 用户名",
    "connection.sshAuthentication": "SSH 认证方式",
    "connection.sshPassword": "SSH 密码",
    "connection.sshPrivateKey": "私钥",
    "connection.sshPrivateKeyPath": "私钥路径",
    "connection.sshKeyPassphrase": "私钥口令（可选）",
    "connection.sshKeepSecret": "留空表示保留现有 SSH 凭据",
    "connection.sshPassphraseOptional": "可选；保存在系统凭据库",
    "connection.sshHostKeyFingerprint": "主机密钥指纹",
    "connection.sshTunnelHelp":
      "仅支持单跳转发。必须固定 SHA256 主机密钥指纹；SSH 密码或私钥口令只存入系统凭据库。",
    "connection.productionWarning":
      "该连接已标记为生产环境。资源写入仍会要求输入连接名并进行版本条件校验。",
    "connection.delete": "删除连接",
    "connection.cancelTest": "取消测试",
    "connection.test": "测试连接",
    "connection.saveAndConnect": "保存并连接",
    "connection.required": "连接名称和 endpoint 不能为空",
    "connection.secretRequired": "新连接启用认证时必须填写密钥",
    "connection.sshSecretRequired": "SSH 密码认证必须填写密码",
    "connection.connected": "已连接 {endpoint}",
    "connection.testSucceeded": "连接测试成功：{endpoint}",
    "connection.testCancelled": "连接测试已取消",
    "connection.disconnected": "连接已断开",
    "workspace.connections": "连接",
    "workspace.collapseConnections": "收起连接栏",
    "workspace.expandConnections": "展开连接栏",
    "workspace.noConnections": "还没有连接",
    "workspace.noConnectionsHelp": "添加 etcd、ZooKeeper 或 Nacos 后开始浏览。",
    "workspace.connecting": "连接中…",
    "workspace.connectAndBrowse": "连接并浏览",
    "workspace.disconnect": "断开连接",
    "workspace.edit": "编辑",
    "workspace.copy": "复制",
    "workspace.addConnection": "＋ 添加连接",
    "workspace.resizeConnections": "调整连接栏宽度",
    "workspace.resources": "资源",
    "workspace.collapseResources": "收起资源栏",
    "workspace.expandResources": "展开资源栏",
    "workspace.resizeResources": "调整资源栏宽度",
    "workspace.import": "从 Atlas JSON 导入",
    "workspace.createResource": "新建资源",
    "workspace.refresh": "刷新",
    "workspace.filterLoaded": "筛选当前已加载资源…",
    "workspace.searchNacos":
      "模糊搜索 group 或 dataId；定位请填 GROUP / dataId",
    "workspace.searchZookeeper": "搜索节点名；定位请填 /绝对路径",
    "workspace.searchEtcd": "搜索 key；定位可填 key 或 base64:…",
    "workspace.search": "搜索",
    "workspace.locate": "定位",
    "workspace.searchRequired": "请输入要搜索的资源标识",
    "workspace.locateRequired": "请输入要定位的资源标识",
    "workspace.etcdBase64Invalid": "base64: 后面的 etcd key 不是有效 Base64",
    "workspace.etcdKeyRequired": "etcd key 不能为空",
    "workspace.zookeeperPathInvalid": "ZooKeeper 路径必须是规范的绝对路径",
    "workspace.nacosLocateFormat": "Nacos 定位格式为 GROUP / dataId",
    "workspace.nacosIdentityRequired": "Nacos 定位需要 group 和 dataId",
    "workspace.locateDiscardConfirm":
      "定位其他资源会丢弃当前未保存的编辑，是否继续？",
    "workspace.located": "已精确定位并读取资源",
    "workspace.listMoved": "列表已变化，已定位到最后一页",
    "workspace.selectDiscardConfirm":
      "选择其他资源会丢弃当前未保存的编辑，是否继续？",
    "workspace.searchState": "“{query}” · 已检查 {count} 个标识",
    "workspace.page": "第 {page} 页",
    "workspace.pageOf": "第 {page} / {total} 页",
    "workspace.complete": "已完成",
    "workspace.backToTree": "返回资源树",
    "workspace.selectConnection": "选择并打开连接",
    "workspace.lazyHelp": "资源会按需加载，不会扫描整个集群。",
    "workspace.dedupedEmpty": "本页结果去重后为空",
    "workspace.noMatches": "没有匹配的资源",
    "workspace.noResources": "当前范围没有资源",
    "workspace.nextPageHelp": "可继续下一页；搜索不会读取资源值。",
    "workspace.adjustSearchHelp": "可调整标识关键词，搜索不会读取资源值。",
    "workspace.emptyHelp": "可以刷新，或检查所选 namespace 和权限。",
    "workspace.loadMore": "… 加载更多",
    "workspace.loadingDemo": "正在加载合成数据…",
    "workspace.loadingRegistry": "正在与注册中心通信…",
    "workspace.searchResult":
      "{matches} 个匹配项 · 本次检查 {scanned} 个标识{suffix}",
    "workspace.searchEnd": " · 已到当前范围末尾",
    "workspace.searchMore": " · 可继续翻页",
    "resource.reading": "正在读取",
    "resource.select": "选择一个资源",
    "resource.selectHelp":
      "资源值仅在选中时读取；二进制数据会以 Base64 无损展示。",
    "resource.serverHistory": "服务端历史",
    "resource.serviceManagement": "服务管理",
    "resource.export": "导出",
    "resource.compare": "比较 / 提升",
    "resource.delete": "删除",
    "resource.safeChange": "安全变更",
    "resource.version": "版本",
    "resource.encoding": "编码",
    "resource.size": "大小",
    "resource.watchIdle": "实时监听未开启",
    "resource.watchStarting": "正在建立监听",
    "resource.watchLive": "实时监听中",
    "resource.watchReconnecting": "连接中断，正在恢复",
    "resource.watchCompacted": "历史事件已压缩，需要刷新",
    "resource.watchExpired": "会话已过期，需要重新连接",
    "resource.watchStopped": "监听已停止",
    "resource.watchFailed": "监听失败",
    "resource.watchCreated": "已创建",
    "resource.watchUpdated": "已更新",
    "resource.watchDeleted": "已删除",
    "resource.watchChildren": "子节点已变化",
    "resource.watchRetry": " · {milliseconds} ms 后重试",
    "resource.watchChange": "{change} · 版本 {version}",
    "resource.watchPrivacy": "监听事件只包含地址、类型和版本，不传输资源值",
    "resource.changeCount": "{count} 次变化",
    "resource.readLatest": "读取最新版本",
    "resource.stopWatch": "停止监听",
    "resource.restartWatch": "重新监听",
    "resource.startWatch": "开始监听",
    "resource.binaryWarning":
      "该值不是有效 UTF-8，已使用 Base64 展示，内容没有被替换或损坏。",
    "resource.editorLanguage": "编辑器语言",
    "resource.validateSyntax": "校验语法",
    "resource.modified": "已修改",
    "resource.validationLocation": "第 {line} 行，第 {column} 列：{message}",
    "resource.validationPassed": "{language} 语法校验通过",
    "resource.highlightOnly": "{language} 当前仅支持高亮",
    "resource.demoWatch": "演示工作区不会建立远端监听",
    "resource.remoteRefreshConfirm":
      "远端资源已变化。刷新会丢弃当前未保存的编辑，是否继续？",
    "resource.remoteLatest": "已读取远端最新版本",
    "resource.remoteDeleted": "远端资源已删除，已移除本地旧内容",
    "resource.watchRefreshFailed": "刷新监听资源失败：{message}",
    "production.locked": "生产环境只读锁已启用",
    "production.unlocked": "生产写入窗口已开启",
    "production.blocked": "{name} 的所有通用与协议原生写入都会在发送前拒绝。",
    "production.remaining": "剩余 {remaining}；到期立即恢复只读。",
    "production.unlock": "限时解锁",
    "production.lockNow": "立即恢复只读",
    "production.unlockTitle": "限时解锁生产写入",
    "production.unlockHelp":
      "解锁只对当前桌面会话生效，不写入连接配置。断开、关闭应用或倒计时结束都会恢复只读。",
    "production.duration": "写入窗口",
    "production.minutes": "{minutes} 分钟",
    "production.confirmName": "输入精确连接名 {name}",
    "production.auditHelp":
      "审计仅记录连接 ID、操作 ID 与解锁时长，不记录 endpoint、凭据或资源 value。",
    "production.unlocking": "正在解锁…",
    "production.confirmUnlock": "确认限时解锁",
  },
  en: {
    "app.demoBadge": "SYNTHETIC DEMO · READ ONLY",
    "app.runtimeSynthetic": "Synthetic · {count} adapters",
    "app.runtimePreparing": "Preparing synthetic data…",
    "app.runtimeRust": "Rust Core · {count} adapters",
    "app.runtimeStarting": "Starting Rust Core…",
    "app.exitDemo": "Exit demo",
    "app.demo": "◇ Demo",
    "app.checkingUpdates": "Checking…",
    "app.updates": "⇩ Updates",
    "app.settings": "⚙ Settings",
    "app.diagnostics": "Diagnostics",
    "app.history": "History",
    "app.newConnection": "＋ New connection",
    "common.cancel": "Cancel",
    "common.close": "Close",
    "common.saveSettings": "Save settings",
    "common.previousPage": "Previous",
    "common.nextPage": "Next",
    "common.unknown": "Unknown",
    "common.dismissNotice": "Dismiss notice",
    "settings.title": "Settings",
    "settings.language": "Interface language",
    "settings.languageHelp":
      "The language preference is stored locally, separately from connection profiles and credentials.",
    "settings.english": "English",
    "settings.chinese": "简体中文",
    "settings.updateNetwork": "Application update network",
    "settings.systemProxy": "Use system proxy",
    "settings.systemProxyHelp":
      "macOS and Windows use the system HTTP/HTTPS proxy; Linux uses proxy environment variables.",
    "settings.manualProxy": "Manual proxy",
    "settings.manualProxyHelp":
      "Used only to check for and download Atlas Registry updates.",
    "settings.noProxy": "No proxy",
    "settings.noProxyHelp":
      "Update requests connect directly and ignore system proxies and proxy environment variables.",
    "settings.saved": "Application settings saved",
    "connection.new": "New connection",
    "connection.edit": "Edit connection",
    "connection.copy": "Copy connection",
    "connection.type": "Type",
    "connection.environment": "Environment",
    "connection.name": "Name",
    "connection.namePlaceholder": "For example: Production config center",
    "connection.endpointEtcd": "127.0.0.1:2379 or etcd-1:2379,etcd-2:2379",
    "connection.endpointZookeeper": "127.0.0.1:2181 or zk-1:2181,zk-2:2181/app",
    "connection.authentication": "Authentication",
    "connection.authMethod": "Authentication method",
    "connection.authNone": "None",
    "connection.authUsernamePassword": "Username / password",
    "connection.authCustom": "Custom context",
    "connection.authMse": "Alibaba Cloud MSE AccessKey",
    "connection.username": "Username",
    "connection.password": "Password",
    "connection.digestPassword": "Digest password",
    "connection.customKey": "Context key",
    "connection.customSecret": "Context secret",
    "connection.customKeyPlaceholder": "For example: accessToken",
    "connection.keepAccessKey":
      "Leave blank to keep the current AccessKey Secret",
    "connection.keepPassword": "Leave blank to keep the current password",
    "connection.keepSecret": "Leave blank to keep the current secret",
    "connection.storeInVault":
      "Stored in the operating system credential vault",
    "connection.credentialHelp":
      "Secrets cross one-time Tauri IPC into Rust and are stored in the operating system credential vault. Connection profiles and WebView state never store them.",
    "connection.enableTls": "Enable TLS",
    "connection.caPath": "CA certificate path",
    "connection.caRequired": "/path/to/ca.pem (required)",
    "connection.caSystem": "/path/to/ca.pem (blank uses system roots)",
    "connection.clientCertificate": "Client certificate path",
    "connection.clientCertificateHelp":
      "Optional; configure together with the private key",
    "connection.clientKey": "Client private key path",
    "connection.clientKeyHelp":
      "Optional; only Rust reads the private-key contents",
    "connection.serverNameHelp": "Optional certificate hostname override",
    "connection.enableSshTunnel": "Connect through an SSH tunnel",
    "connection.sshHost": "SSH bastion",
    "connection.sshPort": "SSH port",
    "connection.sshUsername": "SSH username",
    "connection.sshAuthentication": "SSH authentication",
    "connection.sshPassword": "SSH password",
    "connection.sshPrivateKey": "Private key",
    "connection.sshPrivateKeyPath": "Private-key path",
    "connection.sshKeyPassphrase": "Private-key passphrase (optional)",
    "connection.sshKeepSecret": "Leave blank to keep the SSH credential",
    "connection.sshPassphraseOptional":
      "Optional; stored in the operating system credential vault",
    "connection.sshHostKeyFingerprint": "Host-key fingerprint",
    "connection.sshTunnelHelp":
      "Single-hop forwarding only. A pinned SHA256 host-key fingerprint is required; SSH passwords and key passphrases are stored only in the operating system credential vault.",
    "connection.productionWarning":
      "This connection is marked as production. Resource writes still require the exact connection name and a version condition.",
    "connection.delete": "Delete connection",
    "connection.cancelTest": "Cancel test",
    "connection.test": "Test connection",
    "connection.saveAndConnect": "Save and connect",
    "connection.required": "Connection name and endpoint are required",
    "connection.secretRequired":
      "A secret is required when authentication is enabled for a new connection",
    "connection.sshSecretRequired":
      "A password is required for SSH password authentication",
    "connection.connected": "Connected to {endpoint}",
    "connection.testSucceeded": "Connection test succeeded: {endpoint}",
    "connection.testCancelled": "Connection test cancelled",
    "connection.disconnected": "Disconnected",
    "workspace.connections": "Connections",
    "workspace.collapseConnections": "Collapse connections panel",
    "workspace.expandConnections": "Expand connections panel",
    "workspace.noConnections": "No connections yet",
    "workspace.noConnectionsHelp":
      "Add etcd, ZooKeeper, or Nacos to start browsing.",
    "workspace.connecting": "Connecting…",
    "workspace.connectAndBrowse": "Connect and browse",
    "workspace.disconnect": "Disconnect",
    "workspace.edit": "Edit",
    "workspace.copy": "Copy",
    "workspace.addConnection": "＋ Add connection",
    "workspace.resizeConnections": "Resize connections panel",
    "workspace.resources": "Resources",
    "workspace.collapseResources": "Collapse resources panel",
    "workspace.expandResources": "Expand resources panel",
    "workspace.resizeResources": "Resize resources panel",
    "workspace.import": "Import Atlas JSON",
    "workspace.createResource": "Create resource",
    "workspace.refresh": "Refresh",
    "workspace.filterLoaded": "Filter loaded resources…",
    "workspace.searchNacos":
      "Search group or dataId; locate with GROUP / dataId",
    "workspace.searchZookeeper":
      "Search node names; locate with an /absolute/path",
    "workspace.searchEtcd": "Search keys; locate with a key or base64:…",
    "workspace.search": "Search",
    "workspace.locate": "Locate",
    "workspace.searchRequired": "Enter a resource identifier to search",
    "workspace.locateRequired": "Enter a resource identifier to locate",
    "workspace.etcdBase64Invalid":
      "The value after base64: is not valid Base64 for an etcd key",
    "workspace.etcdKeyRequired": "The etcd key cannot be empty",
    "workspace.zookeeperPathInvalid":
      "The ZooKeeper path must be a canonical absolute path",
    "workspace.nacosLocateFormat":
      "Use GROUP / dataId to locate a Nacos config",
    "workspace.nacosIdentityRequired":
      "Both group and dataId are required for Nacos",
    "workspace.locateDiscardConfirm":
      "Locating another resource discards unsaved edits. Continue?",
    "workspace.located": "Located and loaded the exact resource",
    "workspace.listMoved": "The list changed; moved to the last page",
    "workspace.selectDiscardConfirm":
      "Selecting another resource discards unsaved edits. Continue?",
    "workspace.searchState": "“{query}” · checked {count} identifiers",
    "workspace.page": "Page {page}",
    "workspace.pageOf": "Page {page} of {total}",
    "workspace.complete": "Complete",
    "workspace.backToTree": "Back to resource tree",
    "workspace.selectConnection": "Select and open a connection",
    "workspace.lazyHelp":
      "Resources load on demand; the cluster is never scanned in full.",
    "workspace.dedupedEmpty": "No unique results on this page",
    "workspace.noMatches": "No matching resources",
    "workspace.noResources": "No resources in this scope",
    "workspace.nextPageHelp":
      "Continue to the next page; search never reads values.",
    "workspace.adjustSearchHelp":
      "Adjust the identifier query; search never reads values.",
    "workspace.emptyHelp":
      "Refresh, or check the selected namespace and permissions.",
    "workspace.loadMore": "… Load more",
    "workspace.loadingDemo": "Loading synthetic data…",
    "workspace.loadingRegistry": "Communicating with the registry…",
    "workspace.searchResult":
      "{matches} matches · checked {scanned} identifiers{suffix}",
    "workspace.searchEnd": " · reached the end of this scope",
    "workspace.searchMore": " · more pages available",
    "resource.reading": "Reading",
    "resource.select": "Select a resource",
    "resource.selectHelp":
      "Values load only after selection; binary data is shown losslessly as Base64.",
    "resource.serverHistory": "Server history",
    "resource.serviceManagement": "Service management",
    "resource.export": "Export",
    "resource.compare": "Compare / promote",
    "resource.delete": "Delete",
    "resource.safeChange": "Safe change",
    "resource.version": "Version",
    "resource.encoding": "Encoding",
    "resource.size": "Size",
    "resource.watchIdle": "Live watch is off",
    "resource.watchStarting": "Starting live watch",
    "resource.watchLive": "Watching live",
    "resource.watchReconnecting": "Connection interrupted; reconnecting",
    "resource.watchCompacted": "Watch history compacted; refresh required",
    "resource.watchExpired": "Session expired; reconnect required",
    "resource.watchStopped": "Watch stopped",
    "resource.watchFailed": "Watch failed",
    "resource.watchCreated": "Created",
    "resource.watchUpdated": "Updated",
    "resource.watchDeleted": "Deleted",
    "resource.watchChildren": "Children changed",
    "resource.watchRetry": " · retrying in {milliseconds} ms",
    "resource.watchChange": "{change} · version {version}",
    "resource.watchPrivacy":
      "Watch events contain only address, type, and version—never values",
    "resource.changeCount": "{count} changes",
    "resource.readLatest": "Read latest version",
    "resource.stopWatch": "Stop watch",
    "resource.restartWatch": "Restart watch",
    "resource.startWatch": "Start watch",
    "resource.binaryWarning":
      "This value is not valid UTF-8. It is shown as Base64 without replacement or corruption.",
    "resource.editorLanguage": "Editor language",
    "resource.validateSyntax": "Validate syntax",
    "resource.modified": "Modified",
    "resource.validationLocation": "Line {line}, column {column}: {message}",
    "resource.validationPassed": "{language} syntax is valid",
    "resource.highlightOnly": "{language} currently supports highlighting only",
    "resource.demoWatch": "The demo workspace does not open remote watches",
    "resource.remoteRefreshConfirm":
      "The remote resource changed. Refreshing discards unsaved edits. Continue?",
    "resource.remoteLatest": "Loaded the latest remote version",
    "resource.remoteDeleted":
      "The remote resource was deleted; stale local content was removed",
    "resource.watchRefreshFailed":
      "Failed to refresh watched resource: {message}",
    "production.locked": "Production read-only lock is on",
    "production.unlocked": "Production write window is open",
    "production.blocked":
      "All generic and protocol-native writes to {name} are rejected before dispatch.",
    "production.remaining":
      "{remaining} remaining; read-only mode resumes immediately at expiry.",
    "production.unlock": "Time-limited unlock",
    "production.lockNow": "Return to read-only",
    "production.unlockTitle": "Open a production write window",
    "production.unlockHelp":
      "The unlock applies only to this desktop session and is not saved in the connection profile. Disconnecting, closing the app, or expiry restores read-only mode.",
    "production.duration": "Write window",
    "production.minutes": "{minutes} minutes",
    "production.confirmName": "Enter the exact connection name {name}",
    "production.auditHelp":
      "Audit records only the connection ID, operation ID, and unlock duration—never the endpoint, credentials, or resource value.",
    "production.unlocking": "Unlocking…",
    "production.confirmUnlock": "Confirm time-limited unlock",
  },
} as const;

export type MessageKey = keyof (typeof messages)["zh-CN"];
export type MessageValues = Record<string, string | number>;
export type Translator = (key: MessageKey, values?: MessageValues) => string;

const englishMessages: Record<MessageKey, string> = messages.en;
void englishMessages;

const environmentKeys = {
  unspecified: ["Unspecified", "未指定"],
  development: ["Development", "开发"],
  testing: ["Testing", "测试"],
  staging: ["Staging", "预发"],
  production: ["Production", "生产"],
} as const;

export function localeFromSystemLanguages(
  languages: readonly string[] | undefined,
): AppLocale {
  const language = languages?.[0]?.trim().toLocaleLowerCase();
  if (
    language === "zh" ||
    language === "zh-cn" ||
    language === "zh-sg" ||
    language?.startsWith("zh-hans")
  ) {
    return "zh-CN";
  }
  return "en";
}

export function loadAppLocale(
  storage: ReadableStorage = globalThis.localStorage,
  systemLanguages: readonly string[] | undefined = globalThis.navigator
    ?.languages,
): AppLocale {
  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh-CN") return stored;
  } catch {
    // 不可用的 WebView 存储不应阻止应用启动或系统语言回退。
  }
  return localeFromSystemLanguages(systemLanguages);
}

export function saveAppLocale(
  locale: AppLocale,
  storage: WritableStorage = globalThis.localStorage,
): AppLocale {
  try {
    storage.setItem(STORAGE_KEY, locale);
  } catch {
    // 语言仍在当前会话生效；存储失败不应中断用户操作。
  }
  return locale;
}

export function createTranslator(locale: AppLocale): Translator {
  return (key, values) => formatMessage(messages[locale][key], values);
}

export function formatMessage(
  template: string,
  values: MessageValues = {},
): string {
  const expected = new Set(
    [...template.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map(
      (match) => match[1],
    ),
  );
  const received = Object.keys(values);
  for (const name of expected) {
    if (!(name in values))
      throw new Error(`Missing translation value: ${name}`);
  }
  for (const name of received) {
    if (!expected.has(name))
      throw new Error(`Unexpected translation value: ${name}`);
  }
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_, name: string) =>
    String(values[name]),
  );
}

export function connectionEnvironmentLabel(
  locale: AppLocale,
  environment: keyof typeof environmentKeys,
): string {
  return environmentKeys[environment][locale === "en" ? 0 : 1];
}

export const localeStorageKey = STORAGE_KEY;
