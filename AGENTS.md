# Scripting 项目协作规则（所有新对话先读）

## 唯一工作区
- Cora 项目 ID：`scripting`；Fedora 节点：`node_8f19a246f47907a8b4837c1ffc511a7d`。
- Git 根目录：`/home/ricci/Work/scripting`；Rime 源码：`scripts/rime输入法`。
- GitHub 远端：`origin = https://github.com/riccilnl/my-scripting-widgets.git`。先运行 `git status -sb` / `git branch -vv`，不要猜测当前分支。
- Rime 0.3.44 是历史冻结基线；正式 main 当前版本以 scripts/rime输入法/script.json 和 CI 实际打包制品为准。预览开发使用独立分支，未经真机验收不得移入正式版。

## Git 执行的已验证事实（2026-10-13）
- **Git 不是不能用！** Cora 的 `project_native_run` 可以执行本地 Git、提交与读远端。联网 Git 命令必须传 `network_enabled: true`。
- 实测 `GIT_TERMINAL_PROMPT=0 git ls-remote origin HEAD` 在联网授权下成功。
- 实测 `GIT_TERMINAL_PROMPT=0 git push --dry-run origin HEAD:refs/heads/perf/rime-startup-trace` 失败：`could not read Username for 'https://github.com'`，原因是本机 HTTPS Git 没有推送凭据，**不是 Cora 或 Git API 不能推送**。本机没有已验证的 GitHub SSH 身份；`use_git_ssh: true` 不是免登录开关。
- **既有成功推送路线**：Cora 读取源码／测试／本地提交 → 已连接的 GitHub 插件创建远端 tree/commit 并用 `expected_sha` 更新分支 → GitHub Actions 打包 → Cora 联网 fetch 后有条件地对齐本地。
- 操作顺序、实际调用参数、禁忌和失败恢复见 **`scripts/rime输入法/docs/GIT_WORKFLOW.md`**；任何新对话遇到“git 不能用/不能推送”必须先阅读该文件并区分网络、认证与平台执行入口。
- **禁止**在尚有未推送本地提交或未保存工作区时盲目 `git reset --hard`、`git pull`、`git push --force`；禁止未经审计将预览分支推向 `main`。

## 开发 / 发布约束
- 先读 `README.md`、`scripts/rime输入法/docs/STARTUP_DIAGNOSTICS_2026-10-13.md` 与相关审计报告。
- 最低回归：`node --test scripts/rime输入法/tests/runtime.test.cjs`、`node --test scripts/update_links.test.js`、`git diff --check`。
- 预览更新 URL 必须同时维护 `Rime-startup-trace-latest.zip` 与用户手机旧配置固定指向的 `Rime-startup-trace-0.3.46-preview.scripting` 兼容入口；实际更新以手机 `script.json` 确认为准。
- 记录失败经验和当前可运行命令；不得把 GitHub 插件的授权误认为戴尔 `git push` 已自动拥有认证凭据。

## Scripting 脚本开发与发布闭环（2026-11-05，所有脚本适用）
- **每次创建或修改脚本，必须按顺序完成：创建/修改源码 → 验证 → 发布 GitHub → 核实线上版本。** 用户要求修复即默认授权发布，不得只修改本地或只提出发布方案；无需用户重复提醒。
- 验证包含相关测试、打包校验、`git diff --check`；有条件时进行 TypeScript/TSX 构建检查。没有真机验收必须明确标注，不能把构建通过当成手机功能通过。
- 发布时同步维护 `scripts/<项目>/script.json` 版本号和 `remoteResource.url`，使用项目既定打包命令生成 `<项目>.scripting`，确保 GitHub 上的源码和安装包一致、稳定安装 URL 不变，兼容后续更新。
- 本机 Git 无推送认证时，使用已连接 GitHub 插件更新远端 Git tree/commit/ref，并由 GitHub Actions 构建发布；不得因直接 `git push` 失败就停止。工作流如需更新，应注意 Actions 默认 token 缺少 `workflows` 权限；避免让自动化提交包含工作流文件。
- **验收门槛是线上事实**：检查远端 `main` 的 `script.json` 版本、实际发布的 `.scripting` 包及 CI 发布结果；确认后才向用户报告“已发布/可更新”。如远端未发布成功，继续排障并重试，不能把本地完成表述为交付。
- 检查本地未提交/未推送改动，避免覆盖用户或其他任务的工作；远端发布后安全地同步 Fedora 工作区，禁止盲目强制重置。
