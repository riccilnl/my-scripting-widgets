# Rime 0.3.54 Preview · 候选栏独立更新（2026-10-14）

## 背景与目标

对比 BlackCCCat/Scripting-Scripts 4.0.1 后，选取其局部候选视图订阅思想，不移植主组件、UI 布局或原生 TouchGesture。现有正式 0.3.52 和预览 0.3.53 使用 KeyboardRoot 的 candidates/highlight 状态，每次候选文本或高亮变化都有可能调度整个根视图。目标是减少与键盘按键无关的根更新；**没有声称降低启动耗时或已经证明真机响应速度提升**。

## 冻结契约

- 预览主线 perf/rime-startup-trace；正式 main 0.3.52 不改。
- 0.3.54 的 CandidateViewStore 是仅驻内存的候选视图状态：candidates、highlightedIndex。只有显示文本/绝对索引/高亮变化时通知；仅高亮变化保留既有候选数组对象。
- CandidateBarSubscriber 是组件订阅边界，订阅早晚均会读取最新快照，卸载时取消订阅；KeyboardRoot 卸载时 dispose Store，停止通知并释放候选引用。
- KeyboardRoot 不再持有完整候选列表及高亮 state；只保留 candidateActionCount = min(3, 当前候选数)。这是 spaceActionMap 的 0 / 1 / 2 / 3+ 阈值，不可粗暴改为 boolean；跨阈值应触发根更新。candidateCount 为 0 时必须保留 Rime 空格行为；1、2、3+ 对应上/下滑候选选择可用性。
- **原始 CandidateBar.tsx 原封不动**：触摸矩形、CandidateBar 选择、水平滚动居中、展开按键和 toolbar 不变。九键 Lua、RimeEngine、RimeRuntimeCoordinator、TouchIntentMachine、KeyView 和 ActionQueue 不变。
- 没有增加 Storage 写入、候选输入内容记录、网络请求、后台线程或额外 Rime Session。原有诊断默认关闭。
- Scripting 客户端仍以旧 0.3.46 兼容文件名或稳定 latest.zip 自动更新；必须两个 URL 相同 SHA256、manifest 为 0.3.54、作者 Ricci，不能覆盖正式安装包。

## 本机验收

- node --test scripts/rime输入法/tests/runtime.test.cjs：52/52
- node --test scripts/update_links.test.js：6/6
- python3 -B scripts/rime输入法/tests/create_startup_diagnostic_preview.py
- python3 -B scripts/rime输入法/tests/verify_startup_diagnostic_preview.py
- git diff --check
- 新增针对候选 Store 的相同内容抑制、仅高亮更新、绝对索引变化、退订、卸载、以及空格滑动 0/1/2/3+ 阈值语义的回归。
- CI 负责发布新版 zip/.scripting 和原始旧订阅兼容路径；没有 CI 成功前不声称发布。

## iPhone 验收（需用户完成）

1. 仅更新“Rime启动诊断测试”到 **0.3.54**；在 Scripting 项目详情确认 manifest 版本与安装项目名称，不更新正式 0.3.52。
2. 在相同 iPhone 低电量模式、负载与温度条件下，与此前版本比较。节能模式已被用户发现显著影响启动表现；**启动速度不是本版优化验收目标**。
3. 26 键连续输入，检验候选文本和高亮更新、点击任意候选上屏、翻页与空格上下滑分别选择第二/第三候选，不得丢失候选或选错候选。
4. 九键连续输入、九键拼音筛选、输入与上屏、候选高亮移动；检查空格上下滑及英文模式。
5. 展开候选面板，测试四列网格点击、空白滑动、滚动加载后续候选；候选清空时返回工具条；打开剪贴板与常用语面板，仍可正常关闭/输入。
6. 打开诊断后确认冷/热启动报告仍可读取；如有按键延迟、闪烁或回归，回退已留存的 0.3.53 预览安装包。未完成真机输入验收前，不合入 main。

## 失败经验与非目标

- iPhone 低电量模式影响调度时，不能将单次冷启动数值误判为 Lazy 布局回归。
- 不先引入 Thread.runInBackground；跨线程创建/转移 Rime.Session 的对象生命周期和主线程安全仍需独立真机实验。
- 不立即引入新的 iOS 27 原生 TouchGesture 路线；现有 iOS 26 触摸功能维持。
- 0.3.54 只验证候选视图隔离，不叠加其他优化，以便真机出现回归时有单一原因。
