# 快乐谱 0.1.3 — MySheet 云端连接

来自历史 0.1.2 MySheet 预览包，保留快乐谱搜索、SVG 阅读/保存、官方 DSL 捕获、UUID 去重以及写入后的严格回读验证。

手机首次安装后，打开 **快乐谱 → MySheet → 连接设置**，填写 MySheet 的 HTTPS 地址及曲谱专用 `MYSHEET_API_TOKEN`。不要使用数据库管理员 `MYSHEET_ADMIN_TOKEN`。

- API Token 只保存在该脚本的 iPhone Keychain 作用域，不进入公开 GitHub 源码、安装包或控制台日志。
- 云端只允许 HTTPS；LAN 免认证模式允许私有 IP HTTP，但禁止在 HTTP 上发送 Token。
- `GET /api/songs`、`POST /api/songs`、`GET /api/songs/{id}` 均发送 Bearer Token，源站/校验逻辑保持原样。
- 现有手机脚本不会因为 GitHub 仓库更新而自动收到这个版本：首次需要使用稳定安装链接安装/更新，然后由 `remoteResource` 检查后续版本。
- 若服务的前端还有 Cloudflare Access，单纯 MySheet API Token 无法穿透 Access 登录；应使用未设 Access、但启用 MySheet 自有认证的 HTTPS 地址。
- 未在真实 iPhone 上验证该版本；不要把构建测试结果等同于实际设备验收。
