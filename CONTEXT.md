# Atlas Registry

Atlas Registry 统一呈现不同注册中心的资源，同时保留各协议自身的资源标识语义。

## Language

**Nacos 配置标识**：
一个 Nacos 配置项在 namespace 内由 `group` 与 `dataId` 共同标识；两部分都属于用户可检索的标识。
_Avoid_: 资源名称、dataId

**Nacos 标识搜索**：
在当前 namespace 的全部 Nacos 配置标识中检索；`group` 或 `dataId` 任一包含关键词即视为命中。
_Avoid_: 当前页筛选、dataId 搜索
