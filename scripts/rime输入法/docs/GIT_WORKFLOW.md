# 戴尔 Cora ↔ GitHub Git 操作手册（唯一可执行参考）

> 2026-10-13 基于真机命令和成功发布流程记录；分清 Git **读取**、本地提交、**Git 身份认证**与通过 GitHub 插件写远端。新对话必读，不能再简单说“Git 无法使用”。

## 1. 基线与权限

| 项目 | 值／结论 |
|---|---|
| Cora 项目名 | `scripting` |
| Fedora 节点 ID | `node_8f19a246f47907a8b4837c1ffc511a7d` |
| Git 根目录 | `/home/ricci/Work/scripting` |
| Rime 源码 | `scripts/rime输入法/` |
| origin | `https://github.com/riccilnl/my-scripting-widgets.git` |
| 正式 main | Rime 0.3.44 已验收；禁止把实验性修复直接推 main |
| 诊断开发分支 | `perf/rime-startup-trace`（以实际 Git 读取为准） |
| 本机 Git HTTPS 推送 | **未授权**（2026-10-13 实测 dry-run 失败） |
| GitHub 插件写入 | **已验证可用**，曾成功发布多次测试/正式分支 |
| 远端 Git 读取 | **已验证可用**，Cora 开启 `network_enabled: true` 后 `ls-remote` 成功 |

当前审计时 `perf/rime-startup-trace` 的本地 `727c661` 曾比 `origin/perf/rime-startup-trace` 领先 1 次提交。**该状态是时间点事实，不是永久基线**。每次都要重新核对。

## 2. Cora 读 Git：从真实工作区操作

使用 Cora 的 `mcp__colameta_go__node_call` 调用：
```javascript
const n = "node_8f19a246f47907a8b4837c1ffc511a7d";
const r = await tools.mcp__colameta_go__node_call({
  node_id: n,
  tool_name: "project_native_run",
  arguments: {
    project_name: "scripting",
    direct_argv: ["sh", "-c",
      "git status -sb; git branch -vv; git remote -v; GIT_TERMINAL_PROMPT=0 git ls-remote origin HEAD"],
    network_enabled: true,
    timeout_ms: 25000
  }
});
text(r.result.Response.stdout);
```

工具名称可能按当前连接暴露为直接 `mcp__colameta_go__project_native_run`；先从当前会话工具目录确认，不能凭想象组装调用。单独读写项目文件也可使用 `project_file_read`。不应因 `network_enabled` 遗漏造成的网络报错就断言 Git 不可用。

本地状态检查：
```bash
cd ~/Work/scripting
git status -sb
git branch -vv
git log -3 --oneline
git -c core.quotePath=false diff --name-only
GIT_TERMINAL_PROMPT=0 git ls-remote origin HEAD
```
`git ls-remote origin HEAD` 通常对应远端默认分支，不等于当前开发分支 HEAD；需要另查 `refs/heads/perf/rime-startup-trace`。联网命令的 Cora 调用必须设置 `network_enabled: true`。

## 3. 本地 Git 提交：与远端认证无关

```bash
git status -sb
node --test scripts/rime输入法/tests/runtime.test.cjs
node --test scripts/update_links.test.js
git diff --check
git add -- 'scripts/rime输入法/<明确的修改文件>' # 逐项指定，不要用 git add -A
git diff --cached --check
git -c core.quotePath=false diff --cached --stat
git -c user.name='riccilnl' -c user.email='2405760+riccilnl@users.noreply.github.com' \
  commit -m 'fix(rime): <描述>'
```

本地未设置全局 Git 用户名不是“不能提交”的理由；上面通过提交级 `-c` 指定。正确检查实际作者身份/邮箱，不能滥用他人身份。所有源码与测试变更按项目约定验收后再提交。

## 4. 真正的远端推送：两个方案

### A. 本机 Git 身份可用时

在 Cora 授权联网执行中尝试只读身份预检：
```bash
GIT_TERMINAL_PROMPT=0 git push --dry-run origin HEAD:refs/heads/perf/rime-startup-trace
```
2026-10-13 实测失败：
```
fatal: could not read Username for 'https://github.com': terminal prompts disabled
```
表示 **HTTPS Git 身份未接入执行环境**，不是 `git`、网络或 Cora 本身失效；`git ls-remote` 同时成功就是对照证据。若以后由用户授权配置 Credential Manager/GitHub CLI/SSH key，验证 push --dry-run 成功后才可用正常 `git push origin HEAD:refs/heads/<正确开发分支>`。不得把凭据放进仓库、环境输出或日志。设置 `use_git_ssh:true` 不能代替真正存在且获授权的 SSH 密钥。

### B. 本机 Git 没有推送身份时，使用已连接 GitHub 插件（现有成功路线）

1. 用 Cora 读取本地 Git 状态、确定目标 **预览**分支与变更清单，检查 `git diff --check`、测试、是否有未提交文件。
2. 用 `mcp__GitHub__fetch` 获取远端对应 `/git/ref/heads/<branch>` 的 HEAD SHA，再获取该 HEAD 的 `/git/commits/<sha>` → `tree.sha`。
3. **只对审计过的路径**，使用 Cora `project_file_read` 取真实源码；调用 `mcp__GitHub__create_tree`，参数 `{ repository_full_name:"riccilnl/my-scripting-widgets", base_tree_sha:远端treeSha, tree_elements:[{path,mode:"100644",type:"blob",content:文件全文}, ...] }`。
4. `mcp__GitHub__create_commit`：`{repository_full_name, message, tree_sha:新treeSha, parent_sha:远端headSha}`。
5. `mcp__GitHub__update_ref`：`{repository_full_name, branch_name:"perf/rime-startup-trace", sha:新commitSha, expected_sha:远端headSha, force:false}`。**不得**省略租约检查或设 `force:true`。
6. 远端更新成功后，重新读取实际 GitHub 分支 SHA、GitHub Actions 运行结果、制品/ZIP Manifest 和 SHA256。**源码提交不等于安装包已发布**。
7. 注意：插件生成的提交 SHA 与本地 `git commit` SHA **可能不同**，即使内容完全相同。不要盲目 `git pull --rebase` 或 `git reset --hard`，必须对照变更文件。

新对话可能拥有不同工具能力或插件授权；应先发现工具并调用，不能仅凭一次 Git HTTPS 凭据失败断言“不能推送”。

## 5. GitHub 插件发布后，安全对齐戴尔本地

在 Cora 中开启 `network_enabled: true`：
```bash
git status -sb
git fetch --no-tags origin perf/rime-startup-trace
git rev-parse HEAD origin/perf/rime-startup-trace
git -c core.quotePath=false diff --name-status HEAD origin/perf/rime-startup-trace
git log --left-right --oneline HEAD...origin/perf/rime-startup-trace
```

**两边还有提交差异时：**
- 若本地有未推送工作成果，先保留检查点（分支或 tag），核实文件改动与发布版本全部等价，再选择 rebase/merge 或用 `reset --mixed` 对齐。
- `git reset --mixed origin/<branch>` 仅在已确认全部本地提交内容已被远端覆盖、有检查点且 Git 工作区可安全处理时使用；它改 HEAD/暂存区，不应一律套用。对于 Actions 新写入的安装包，须确认来源后再 `git restore --worktree --source=HEAD -- <明确路径>`。
- 如远端已经被其他对话提交更新，先重新 fetch、复核，不得强推或覆盖。
- 核对 `git status -sb` 干净、`git rev-parse HEAD` 与远端 SHA 一致，才报告“已对齐”。

## 6. CI 和 iPhone 自动更新：防止再次回归

- GitHub Actions 在测试分支上运行 Rime 回归和打包；`main` 正式 Rime 0.3.44 禁止误更新。
- `perf/rime-startup-trace` 的测试更新包除了 `Rime-startup-trace-latest.zip`，**必须同步覆盖手机旧配置固定绑定的 `Rime-startup-trace-0.3.46-preview.scripting`**。两个 URL 必须返回同一最新版、相同 SHA256、不同于旧版的版本号。手机实际更新以 Scripting MCP 读取已安装 `script.json` 为准。
- iOS Scripting 可能自行固定首次安装的 remoteResource URL；因此不要只检查打包脚本的 manifest。详见 `STARTUP_DIAGNOSTICS_2026-10-13.md`。
- 不要求 Fedora 与 GitHub Ubuntu 的 ZIP 压缩字节逐项相同；用解压后每个文件的内容做源码等价验证，以 Runner 发布成品 SHA256 作为最终下载校验值。

## 7. 失败经验速查

| 现象 | 应优先确认 |
|---|---|
| 无法解析 github.com | Cora `network_enabled:true`；不是先改 Git |
| `git ls-remote` 成功、`git push` 认证失败 | GitHub HTTPS/SSH 凭据缺失；使用已连接 GitHub 插件写入 |
| GitHub 插件可写、本地 `git push` 失败 | 两者有独立授权，正常，不要混淆 |
| 本地领先 origin 1+ 提交 | 防止 `reset` 抹掉本地历史；先备份及比对 |
| 插件 push 成功但本地 Git SHA 不同 | 远端重新创建的 commit SHA 不相同；先对照源码和制品 |
| Actions 成功但手机显示旧版 | 检查远端 ZIP、手机实际 `script.json` 更新地址/hash 和包内版本 |
