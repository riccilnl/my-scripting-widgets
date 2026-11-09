# 快乐谱 0.1.6 — MySheet 云端连接

来自历史 0.1.2 MySheet 预览包，保留快乐谱搜索、SVG 阅读/保存、官方 DSL 捕获、UUID 去重以及写入后的严格回读验证。

手机首次安装后，打开 **快乐谱 → MySheet → 连接设置**，填写 MySheet 的 HTTPS 地址及曲谱专用 `MYSHEET_API_TOKEN`。不要使用数据库管理员 `MYSHEET_ADMIN_TOKEN`。

- API Token 只保存在该脚本的 iPhone Keychain 作用域，不进入公开 GitHub 源码、安装包或控制台日志。
- 云端只允许 HTTPS；LAN 免认证模式允许私有 IP HTTP，但禁止在 HTTP 上发送 Token。
- `GET /api/songs`、`POST /api/songs`、`GET /api/songs/{id}` 均发送 Bearer Token，源站/校验逻辑保持原样。
- 现有手机脚本不会因为 GitHub 仓库更新而自动收到这个版本：首次需要使用稳定安装链接安装/更新，然后由 `remoteResource` 检查后续版本。
- 若服务的前端还有 Cloudflare Access，单纯 MySheet API Token 无法穿透 Access 登录；应使用未设 Access、但启用 MySheet 自有认证的 HTTPS 地址。
- 未在真实 iPhone 上验证该版本；不要把构建测试结果等同于实际设备验收。

## 0.1.4 云端诊断修复

- 不改动快乐谱搜索、原生 DSL、MySheet API 或 Keychain 凭证。
- 所有曲谱 API 统一按文本读取响应，再严格校验 JSON。若云端代理返回 HTML，显示 HTTP 状态及重定向提示，不再抛裸 JSON Parse error，且不显示 HTML 或 Bearer Token。
- 连接设置新增只读「测试已保存连接」：GET /api/songs，报告曲谱数量或认证/路由错误；测试不会写入数据库。测试前应先按「保存连接」。
- 以上诊断可区分 HTML 网页响应与真实 MySheet HTTP 401/403，但未在 Cloady 实例或真实 iPhone 上复现原始 HTML 来源。

## 0.1.5

恢复 Scripting `Response.json()` 读取，保留 HTML / 401 诊断；按读取列表、检查曲谱 ID、写入和回读阶段提示错误。MySheet 的 DSL 与 Token 管理方式不变。手机端尚未验收。

## v0.1.6 UUID 查重优化

- 云端 MySheet 新版支持 `GET /api/songs?source_provider=kuaiyuepu&source_uuid=<uuid>`，返回 `lookup=source_uuid_v1` 和全量命中记录；大幅减少手机连续查询请求数。
- 云端旧版会忽略查询参数并返回旧列表，脚本自动使用严格逐首查重，避免漏查重复 UUID。旧版仅对安全的 GET 请求进行最多 3 次重试；POST 不自动重试。
- 无需重新输入 MySheet 地址或曲谱 Token；保留原生 DSL 字节一致性核查和写入后回读。
- 新接口必须先将 MySheet 服务端部署到 Cloady，单独更新此脚本不能让旧服务器具备新能力。
