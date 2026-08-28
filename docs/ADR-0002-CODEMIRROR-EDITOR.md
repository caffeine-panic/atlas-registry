# 使用 CodeMirror 6 承载配置编辑

- 状态：accepted

Atlas Registry 使用 CodeMirror 6 替换资源详情中的原生 textarea，以模块化提供配置语法高亮、行列定位与按需校验。没有选择 Monaco，是因为当前需求不需要完整 IDE 语言服务，而 Monaco 的 Worker、CSP 与打包集成会给 Tauri WebView 引入更高的体积和维护成本；编辑器只辅助查看与校验，不自动格式化内容，也不改变既有保存语义。
