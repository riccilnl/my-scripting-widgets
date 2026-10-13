# Rime Lazy 候选面板启动性能 A/B 实验（2026-10-13）

## 依据与限制

用户认为引入 Lazy 布局后键盘整体启动变慢。历史代码：ExpandedCandidatePanel 从 2026-10-04 使用 LazyVStack，2026-10-13 的 f9c0b12 改用 LazyVGrid。默认 candidateExpanded=false，首次键盘渲染不会挂载面板，但 keyboard/main.tsx 静态导入该组件。现有启动报告从 keyboard main() 计时，静态模块解析和首次画面不在范围内。不能据此确认或排除 Lazy 对完整启动的影响；141–165 ms 原生 Session 成本也尚未证实与它有因果关系。

## 对照包

A/B 基线冻结为已发布的 Rime 启动诊断测试 0.3.53 安装包，SHA256 12da34808f629ab53a64108dc9ffb18602eb5c25f03db3927fb6a3e695afccc0。以后预览分支继续开发，不得变动这两份同名 0.3.54 快照。构建器检查冻结包 hash 并从该 ZIP 提取全部源文件。

完全复用同一预览源码和启动诊断。两包源代码唯一差异为 keyboard/components/ExpandedCandidatePanel.tsx（逐文件 ZIP 校验）。

- A：Rime冷启动Lazy组，0.3.54。原版 LazyVGrid 四列候选面板。
- B：Rime冷启动普通组，0.3.54。用普通 VStack + HStack 实现同等四列、命中矩形、点击候选、分页触发；不导入 LazyVGrid/LazyVStack。
- 正常键盘主页面、Rime 核心、九键、诊断、存储和启动初始化顺序一致。两者作者 Ricci，安装名不同，避免覆盖正式版或已安装的启动诊断预览。
- 两份是独立、无自动更新的 A/B 快照。它们不是正式版的替代品；普通版一次性创建大量候选视图可能不适合长期使用。
- 正式 main 0.3.52 与稳定诊断预览 0.3.53 保持不变；原预览 latest.zip 和 0.3.46 兼容更新地址不受影响。

## iPhone 独立安装地址

A／Lazy：
https://raw.githubusercontent.com/riccilnl/my-scripting-widgets/refs/heads/perf/rime-startup-trace/previews/rime-lazy-ab-20261013/Rime-startup-lazy-0.3.54.scripting

B／普通：
https://raw.githubusercontent.com/riccilnl/my-scripting-widgets/refs/heads/perf/rime-startup-trace/previews/rime-lazy-ab-20261013/Rime-startup-plain-0.3.54.scripting

校验和同目录 SHA256SUMS.txt，GitHub Actions 自动发布；链接是安装快照，不是更新订阅。

## 真机验收

1. 安装两个独立项目，明确在 iOS 系统键盘里选 A 或 B；使用相同输入宿主 App、九键设置、词库、设备负载。
2. 两组开启诊断并分别复制每次报告。共享 Storage 只保留最近一次，不会自动保存多次样本；为每份报告标注 A/B。
3. 每组至少取得 5 次热启动；对比 JS 总时长、UI Effect 等待、Schema、原生 Session 耗时的中位数，以及首次可输入的体感。建议交替测试 A/B。
4. 各组尽量取得至少 3 次确实执行 Rime.setup 的样本，报告中的 rime.setup.begin 表示本轮初始化。关闭键盘不保证杀死 iOS 扩展，也不保证下一次是冷启动；需交替先测 A/B，尽可能控制顺序偏差。
5. **尤其要用 iOS 屏幕录像**比较切换键盘到首帧和首个有效输入。现有 JS 计时不覆盖静态模块加载，不能仅用 startup.ready 时间判定 Lazy 假设。
6. B 组还须测试展开候选列表的行内点击、行间空白滑动、4 列布局及滚到底自动加载；如果展开候选大量卡顿，不能直接把 B 组替换到正式版。
7. 若完整启动和首次输入在 B 组显著改善，再审计 Lazy 的静态导入或布局实现；若仅单次更快或无稳定差异，保留 Lazy 实现。勿因一次启动结果便合入正式版。

源码和 CI 必须验证：两包除独立名字的 script.json 外，只有 ExpandedCandidatePanel.tsx 运行时代码不同。不能因 A/B 发布覆盖原来的 stable latest.zip。
