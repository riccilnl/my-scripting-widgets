# Rime 0.3.44 性能与资源生命周期审计

- 日期：2026-10-13
- 审计类型：只读源码 + Node 模拟调用计数；不修改键盘功能、不修改版本、不发布。
- 冻结基线：Git main `56125d2c1d481dcb65c83f7f447cb590641a2ec5`，手机实际运行 0.3.44。
- 审计范围：启动/Rime Session、T9 探测与候选、键盘输入和渲染、触觉、异步、剪贴板、万象资源更新。
- 结果：原有 Rime 自动测试 19/19 PASS、打包工具测试 6/6 PASS；均为离线功能回归，并非 iPhone 性能测试。

## 已经实现且应保留的优化与释放契约

1. `keyboard/layout/KeyCatalog.ts` 缓存不随一次键盘会话变化的按键定义；`keyboard/main.tsx:116-129` 通过 ref 初始化一次。
2. `keyboard/runtime/RimeRuntimeCoordinator.ts:17,32-35` 仅在 Rime 未 setup 时初始化，避免每次装载都扫描已安装 schema；`RimeEngine.close()` 在初始化失败和 KeyboardRoot 卸载时调用。
3. `core/rime/T9BridgeRuntime.ts:245-255` 基于文件元数据标记实现快速路径，避免每次键盘启动读取完整 Lua 文件。
4. `keyboard/components/KeyView.tsx:285-294` 清除长按/退格定时器并停止重复器；`keyboard/input/actionQueue.ts` 在卸载时清理异步队列；`keyboard/edit/EditController.ts` 阻止卸载后的剪贴板回调修改宿主。
5. `keyboard/components/CandidateBar.tsx:68-83` 和 `ExpandedCandidatePanel.tsx:46-53` 清除对应滚动/分页定时器。
6. `keyboard/feedback/haptics.ts:66-73` 提供停止与释放；`AuxiliarySurfaceHost.tsx:121-140` 使用 disposed 标志阻止异步 Clipboard 回写已卸载视图。

## 审计发现（按优先级）

### A1 — T9 按键热路径重复访问 Rime，确认存在

- `keyboard/main.tsx:207-240` 的 `publish` 几乎每次 Rime 输入/候选移动都会执行。
- T9 有效模式下 `publish` 无条件调用 `engine.queryT9PinyinOptions()`；`core/rime/RimeEngine.ts:246-255` 每次执行 `session.processKey(T9_BRIDGE_PROBE_KEY)` 与 `session.getProperty`，再解析字符串。
- `publish` 同时读取引擎的 ascii 状态、生成候选数组、比较字符串列表并触发多次视图状态更新。
- 影响：每次普通 Rime 输入除了实际 key mutation，T9 还会增加一次 probe 原生 Rime 键处理和属性读取；是否耗时需真机埋点。
- 方案：按 Rime 会话版本/已知可能改变 T9 options 的操作做失效缓存，合并同一输入事务的派生状态计算，保留 T9 拼音栏与预编辑同步；不得直接删 probe。

### A2 — 展开候选重复从首批扫描，模拟调用量确证

- `keyboard/main.tsx:380-414` 每批把累积 limit 增加 96，调用 `engine.collectCandidateBatch(nextLimit)` 然后仅附加结果切片。
- `core/rime/RimeEngine.ts:138-204` 每次从当前第一页不断 `KEY_PAGE_DOWN` 再 `KEY_PAGE_UP` 恢复原页，并尝试恢复高亮。
- 只读模拟：1024 个候选、每页 8 个、原高亮 3。依次请求 96/192/288/384/480/576，分别额外执行 25/49/73/97/121/145 次 Rime 键；累计 510 次 Rime key 调用和 528 次 `session.context` 快照读取。
- 这些数字代表模拟 API 调用次数，不是实机毫秒、CPU 时间或耗电数据。
- 因 Rime 官方确认 `session.context` 每次访问产生新快照，重复扫描同时产生新数组/对象分配。
- 方案：先研究维持当前候选顺序、高亮与输入 session 不变的增量获取策略；无随机分页 API 时不得假定单纯缓存 offset 就能避免 Rime 原生扫描。优先减少重复全量临时数组、状态拷贝并控制扫描节奏。

### A3 — 键盘根组件状态影响大范围布局/视图对象创建，结构性高概率开销

- `keyboard/main.tsx:130-151` 根持有大量 state；`849-923` 内的 GeometryReader 每次重新生成 CandidateBar 与 `renderT9`/`renderQwerty`/其它主键视图树。
- `keyboard/components/KeyView.tsx:67-131` 每次求 face/排版参数；`198-283` 手势定义使用 `useMemo([])` 稳定，已有部分优化。
- Scripting 文档支持 `useMemo`/`useCallback`；仍需确认此应用的原生视图 diff/组件复用机制，不能把父级渲染次数直接等同于原生视图重建。
- 方案：隔离候选栏与静态键盘布局依赖；仅将必要状态传入按键；以真机 render/commit 计数选择 memo 化热点，避免机械给全部视图加缓存。

### B1 — Core Haptics 空闲运行配置有功耗风险

- `keyboard/feedback/haptics.ts:81-85` 设置 `engine.autoShutdownEnabled = false`，三个播放器缓存到同一 engine；`66-73` 仅在 KeyboardRoot 卸载时 stop/dispose。
- 风险：键盘可见但长期未输入时引擎可能继续占用系统触觉资源。与默认自动关闭行为的实际功耗差需 iPhone 测量。
- 方案：用 iPhone 真机 A/B 比较自动关闭与保持常开在首击延迟、连续触觉稳定性、60 秒空闲能耗/内存上的差异，不可未经测试直接关闭反馈或减少用户已验收的触感。

### B2 — 启动流程没有中途取消信号，已关闭键盘仍可能执行初始化

- `keyboard/main.tsx:153-185` 卸载设置 disposed，若初始化最终完成则关闭新 session；保护了 session 释放。
- `keyboard/runtime/RimeRuntimeCoordinator.ts:16-78` 与 `core/rime/T9BridgeRuntime.ts:233-295` 在 Promise pending 期间没有 AbortSignal/协作取消，仍可能继续 I/O、schema 部署与桥检查。
- 方案：可取消的 JS 只读/非事务阶段提前停止，不中断已开始的 Rime 部署/配置原子性；确保所有 finally close 与一次性资源释放覆盖失败和取消路径。

### B3 — 反复将相同预编辑内容写给宿主需测量

- `keyboard/main.tsx:207-240` 无论候选 highlight/某些状态是否变化都调用 `applyRimeHostText`。
- `keyboard/input/RimeHostTextBridge.ts:25-66` 对非空 preedit 调用 `CustomKeyboard.setMarkedText`。
- 风险：原生 host bridge 触发文本变更/光标同步的成本可能高于 JS 计算。
- 方案：只有实测重复调用严重时再设冗余写入消除条件；commit/unmark 顺序及不同 App 对 marked text 的兼容性是冻结契约，不能用简单 text 相等判断直接跳过。

### C1 — 更新大模型时的瞬时内存峰值

- `settings/wanxiang/WanxiangInstall.ts:103-113` 下载后使用 `await fm.readAsData(destination)` 一次性读整份文件进行 SHA256；网络 fallback 使用 `arrayBuffer` 加 `Uint8Array`。
- 风险：大体积 grammar/model 可能在 iOS 内存紧张时出现峰值。该路径只在更新时执行，不属于正常按键热路径。
- 方案：核对 Scripting Crypto/FileManager 是否支持流式校验或分块文件读取；先测峰值，保持完整性校验和失败回滚。

### C2 — 次要分配与存储，暂不优先

- 候选条 `.slice(0,12)`/短文本 `Array.from` 每次渲染分配少量对象；可在高频渲染优化后再看。
- `EditController.backspaceUnitCount` 每次构建 `Intl.Segmenter`，但不在每次普通字符输入路径，可安全共享 formatter 后回归测试。
- `AuxiliaryStorage` 剪贴板历史限定最多 50 项，当前加载/写入由用户编辑或剪贴板动作触发；不建议为了此微优化增加后台缓存一致性负担。
- `ExpandedCandidatePanel` 使用 LazyVGrid，且计时器有 cleanup；保持 0 间距和全格命中设计。

## 后续修改顺序与验收契约

1. **先测量**：仅开发/诊断构建中计数，记录一次输入的 Rime 原生调用、JS render/commit、`setMarkedText`、会话 setup 时间；禁止每个按键落盘。
2. **第一阶段**：T9 probe/派生状态冗余剔除；同样输入序列必须得到逐步相同的 context、commit、候选顺序、高亮、显示预编辑。
3. **第二阶段**：分页扫描与临时数组减少；保持原有全量候选、滚动与自动分页、高亮/原页恢复能力，完整候选覆盖率不得降低。
4. **第三阶段**：隔离非相关组件的更新，验证水平候选按钮、展开网格、T9/Qwerty/Symbols/Numeric 键映射和手势不回归。
5. **第四阶段**：haptics 空闲/触觉 A/B、异步取消路径、万象大文件峰值控制。
6. **验收**：每阶段运行 `node --test scripts/rime输入法/tests/runtime.test.cjs` 和 `node --test scripts/update_links.test.js`；真机分别测 20 次冷启动、100 次连续输入、展开 96→576、60 秒静止键盘、退出键盘后 60 秒资源回落；P50/P95 延迟、原生调用次数、RSS/峰值与功耗由手机真实工具采样，未采样不得写提升百分比。
7. **冻结规则**：不改变版本 0.3.44 的显示与输入行为；未验收前不修改手机，不发布 GitHub，也不改变现有部署/安装路径。

## 参考接口契约

- Scripting Rime 官方文档：https://scriptingapp.github.io/zh/guide/Rime
- Scripting Hook 文档：https://scriptingapp.github.io/zh/guide/Quick%20Start
- Scripting Haptics 文档：https://scriptingapp.github.io/TestFlight/zh/guide/Changelog/3.1.0/Haptics/


## 2026-10-13 — 性能优化第一阶段（戴尔未发布）

### 复核后调整的假设

- T9 私有 F23 probe 的 Lua 实现每次基于当前候选菜单、已选拼音和 partial prefix 计算 option；**不能按裸 preedit 文本缓存并跳过真实 Rime mutation 后的 probe**，否则候选拼音可能错位。
- Scripting Rime 的公开 JS Session 接口仅暴露当前 menu/candidates 和 page key，不支持无副作用的任意偏移分页读取；增量优化目前不可能在保留现有行为的同时取消回到原页的 KEY_PAGE_UP/DOWN。

### 落地修改与验收

1. `core/rime/RimeEngine.ts`: `collectCandidateBatch(limit, skip = 0)` 在扫描时跳过已经展示过的候选包装对象，仍执行原版 Rime 翻页和原页、高亮恢复，返回的 `hasMore` 保持一致；默认 skip=0 与原接口等价。
2. `keyboard/main.tsx`: 后续每批候选直接追加 `collectCandidateBatch(nextLimit,currentCount)` 的新结果，不再构造完整历史列表再 `slice`；保留 96 批量、候选原下标和滚动命中结构。
3. `keyboard/main.tsx`: Shift/Caps 只改变 JS 侧状态，跳过 `publish()` 引起的无意义 F23 Lua probe、重复 host marked-text 发布。真正的 Rime mutation 仍继续每次 probe。
4. `keyboard/main.tsx`: 单次 `publish()` 中复用 T9 schema/ASCII 判定，避免重复获取相同状态；最终的 ascii 状态更新仍放在 probe 之后。
5. `keyboard/edit/EditController.ts`: 复用 `Intl.Segmenter` 且直接迭代 grapheme segments，避免每次计数新建 Segmenter 和中间数组；dispose 同时清空已删除文本缓冲，防止异步拆卸期间保留长文。
6. `layout/metrics.ts` + `keyboard/main.tsx`: 键盘会话内只缓存最后一次计算的几何信息；宽度、布局对象或皮肤几何对象变化就重新计算，确保旋转和皮肤设置仍有效。
7. `tests/runtime.test.cjs` 新增 7 项回归：原页/高亮/候选等价、候选包装数量计数、Shift/Caps 无原生 mutation、Segmenter 复用、卸载清理缓存、T9 读状态、不同屏幕/皮肤几何缓存失效。

### 定量结果及边界

- 模拟 1024 候选、每页 8 个、6 批加载至 576：新建候选包装对象 **2016→576**，减少 **1440（71.4%）**；原生 Rime 按键数仍为 **510**，未夸大为 CPU/内存总体下降。
- 键盘布局参数不变时，`createKeyboardMetricsResolver()` 的对象引用复用在 100 次相同输入下通过；没有 iPhone 实机渲染次数采样，不声明具体帧率变化。
- 代码回归：Rime **26/26 PASS**；打包工具 **6/6 PASS**；全部 62 个 `.ts` 文件 Node 语法解析 PASS。
- 测试经验：第一次几何测试使用过低的 t9LeftColumn.max，导致不同 fraction 都被上限夹到同一宽度；已修正测试夹取范围后验收通过。这不属于产品代码失败。
- 本轮尚未做完整 TSX 类型检查和 iPhone 内存/CPU/功耗测试。保持 0.3.44 主线基线，改动只留戴尔未提交，勿自动发布。

### 后续仍需实测/改进

- iPhone 中对比冷启动、连续 100 字输入的 P50/P95、展开 96→576 滚动流畅度、键盘空闲 60 秒内存/能耗；验证候选条横向点击、四列展开滑动、T9 部分拼音选择与英文大写。
- Core Haptics `autoShutdownEnabled=false` 仍保持冻结行为；先对照振动延迟与空闲资源后再决定是否改变，不凭静态审计直接关引擎。
- T9 真正的 F23 Lua 菜单扫描、候选遍历的 510 次原生翻页仍是尚未解决的性能瓶颈；不能未经官方 API 支持绕过。

## 2026-10-13 — 第二阶段：视图纯计算缓存与退出资源释放（戴尔待验收）

### 保持行为的改动

- `keyboard/components/KeyView.tsx`: 用 Scripting 官方 `useMemo` 缓存 `projectBaseKeyFace()` 结果，仅随 KeyDefinition、KeyFacePreferences、Shift、Caps、ASCII 模式依赖变化重新计算。按键拖动手势、命中结构与 UI 层级没有修改。
- `keyboard/components/ExpandedCandidatePanel.tsx`: 网格 `columns` 按 `cellWidth` 缓存、补齐空格的 `cells` 按候选数组引用缓存。原 `LazyVGrid`、4 列、0 spacing、透明点击矩形、分页触发和按钮语义均不变。
- `keyboard/feedback/haptics.ts`: 异步原生 stop/dispose 与 Haptics.transient 如果返回 rejected Promise，捕获拒绝，避免无效异步异常破坏键盘事件循环。同步释放调用顺序、玩家池 3 个、强度/锐度/autoShutdownEnabled=false 不变。
- `keyboard/main.tsx`: 通过候选栏右侧关闭键盘 `CustomKeyboard.dismiss()` 成功后主动调用 `disposeKeyboardHaptics()`，不依赖键盘扩展进程在退出时立即终止。已经存在的 unmount 清理仍有效且幂等。

### 实际验证范围

- 已通过 Node 模拟的引擎启动/释放竞态测试、连续 100 次触觉请求仅创建 3 个可复用播放器、stop/dispose/transient 的 Promise 拒绝测试；它们不代表手机上的触觉延迟和电量测量。
- `KeyView` 和 `ExpandedCandidatePanel` 的 memo 依赖以及命中结构通过源码不变量测试；当前环境未安装 TypeScript/TSX 完整编译器，因此仍需用 Scripting 真机运行验证。
- 仅模拟离线环境可以证明候选包装对象/数组重复分配减少；不能据此宣称手机 FPS、CPU 或电池改善。

### 后续真机测试协议（不更改 0.3.44 用户基线）

1. 使用分离的测试版本导入，避免覆盖当前已验收的 0.3.44。
2. 启动/退出分别重复 20 次，检查首次候选渲染延迟、触觉首次反馈、退出 2 分钟后内存/进程是否回落。
3. 同一输入序列分别测 100 次按键、连续两分钟静止键盘、展开 96→576、T9 左栏候选等价与选词顺序。
4. Apple Core Haptics `autoShutdownEnabled=true` 空闲关闭约在 2 分钟左右；本轮不改配置，不得以 60 秒静置当作自动休眠效果验证。
5. iOS 第三方键盘扩展进程在界面消失后不保证立即终止，不能仅以 keyboard dismissal 推断系统已释放整个进程的内存。必须实测。

### 外部接口依据

- Scripting Hook: https://scriptingapp.github.io/zh/guide/Quick%20Start
- Scripting Haptics: https://scriptingapp.github.io/TestFlight/zh/guide/Changelog/3.1.0/Haptics/
- Apple Core Haptics automatic shutdown: https://developer.apple.com/documentation/corehaptics/chhapticengine/isautoshutdownenabled
- Apple custom keyboard extension lifecycle: https://developer.apple.com/documentation/uikit/creating-a-custom-keyboard

### 第二阶段最终复核

- `node --test scripts/rime输入法/tests/runtime.test.cjs`：**33/33 PASS**；`node --test scripts/update_links.test.js`：**6/6 PASS**；62 个 TS 文件 Node 语法解析通过。
- `git diff --check` PASS；版本仍为 0.3.44；Git HEAD 仍为 56125d2；未更改候选栏 `CandidateBar`、T9 Lua、原手势状态机/长按及空格拖动实现。
- 新增/修改合计 8 个已有源码/测试文件 + 1 份审计记录；仅存放在戴尔 Git 工作区中，尚未提交、打包、上传手机。
- 完整 TypeScript/TSX 类型检查未完成（戴尔工作区未找到 tsc/typescript 依赖）；iPhone 运行效率、内存、耗电和触觉真实时延尚未测量，不应虚构百分比。

## 2026-10-13 — 第三阶段：生命周期收口、类型对照、隔离测试制品

### 资源生命周期修正

- `keyboard/runtime/RimeRuntimeCoordinator.ts` 增加可选 `isCancelled` 回调。在 `setup`、读取 schema、deploy、T9 桥检查等 await 边界之后检测是否已经关闭键盘；取消后避免继续创建 Rime Session。
- Session 构建后如已取消，在原有 try/catch 中关闭刚创建的 Session；不修改正常选择 schema、T9 bridge probe 或提交行为。
- `keyboard/main.tsx` 的 useEffect 将卸载状态以 `isCancelled: () => disposed` 传给初始化流程，保留既有卸载时的 Session close 与异步失效保护。
- `keyboard/feedback/haptics.ts` dispose 时解除 onStopped/onReset 原生回调引用，然后依原次序停止/释放引擎，减少扩展进程驻留期间的对象链。

### 完整类型检查对照

- 在 `.git/typecheck` 安装 TypeScript **5.9.3**，没有为工程新增 npm 依赖或修改正式仓库配置。
- 单独限定 Rime 项目和本机保存的 Scripting `dts/` 运行完整 TS/TSX `tsc --noEmit`。
- **冻结提交 0.3.44：13 项类型诊断；当前优化代码：13 项；新增诊断：0。**
- 既有诊断包括 `minimumScaleFactor` 与 SDK 类型名 `minScaleFactor` 的差异、未导出 `Crypto` 的声明、设置页部分静态类型和手势属性冲突。本轮不为消除此类基线错误而改动已验收行为。
- 对照测试在 `.git/typecheck/compare.cjs` 使用 TypeScript CompilerHost 加载冻结 Git 源码和当前源码两套文本，无需额外源码分支。

### 可重复的离线 A/B 安装包

- 通过 `python3 scripts/rime输入法/tests/create_perf_preview.py` 在 `.git/perf-preview` 生成两份 ZIP/Scripting 包；不会改写 GitHub 正式安装包或用户手机版本。
- `Rime-baseline-0.3.44.scripting`：从 Git 提交 `56125d2` 冻结的正式安装包字节读取，内部项目名 `Rime基线测试`，版本 0.3.44。
- `Rime-performance-0.3.45-preview.scripting`：从戴尔优化工作区生成，内部项目名 `Rime性能测试`，版本 0.3.45（**仅预览标签**）。
- 两份都包含 82 个运行文件，不含 docs/tests；两个项目目录名称各异、不会直接覆盖名为 `rime输入法` 的源码目录。
- **重要限制**：Rime 词库和共享设置可能仍经 App Group 被两个测试项目与正式版本共同使用。测试包目录隔离并不代表应用数据完全隔离，真机需要防止并发输入和数据库写入相互影响。
- SHA256 值见 `.git/perf-preview/manifest.json`；重复打包对照哈希一致。此制品目前仅在戴尔本地，未上传 GitHub、未同步或安装手机。

### 验收与剩余条件

- Rime 回归 **37/37 PASS**，其中增加取消初始化、释放新建 Session、正常启动、解绑触觉回调四项。
- 打包器 **6/6 PASS**；未发现新增 TypeScript/TSX 类型诊断；`git diff --check` PASS。
- 下一步由用户使用 GitHub 测试分支获取测试包后，才能执行 iPhone 真机 A/B；当前没有可核实的 iPhone CPU、RSS、电量或输入延迟数据。
- 保持 GitHub main、正式 0.3.44 安装包及手机版本不变，待手机确认再决定正式发布。

### GitHub A/B 测试流水线故障经验（2026-10-13）

- 第一次 GitHub Actions 运行 `38353471381` 时，37/37 Rime 测试、6/6 打包测试与两份 ZIP 生成均 PASS，但强制比较 GitHub Ubuntu Runner 与 Fedora 的 ZIP SHA256 导致失败。两个环境生成相同 82 个条目，ZIP 压缩结果分别不同（zlib/Python 实现或版本差异），故不应跨系统要求压缩字节相同。
- 修正为 `tests/verify_perf_preview.py`：逐一验证 82 个 ZIP 条目的解压内容与冻结 `56125d2`/当前测试源码精确相同、候选触摸/T9 桥无额外变化、manifest 仅有显式名称和预览版本差异；最终以 GitHub Runner 生成并发布的安装包实际 SHA256 作为下载校验值。
- 这项校验不放松安装内容审计：即使 ZIP 字节不同，也必须对每一个解压文件进行内容等价验证。
