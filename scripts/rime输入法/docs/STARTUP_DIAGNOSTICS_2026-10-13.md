# 启动链路诊断 · 第四阶段 · 2026-10-13

## 冻结与发布范围

- 正式主线 `main` 的 0.3.44 保持不变；旧 A/B 分支 `perf/rime-0.3.45-preview` 保持不变。
- 本阶段代码仅位于新的 `perf/rime-startup-trace` 分支，诊断版 Scripting 项目名为 `Rime启动诊断测试`；旧版 0.3.45，新版 0.3.46（均非正式版）。
- 所有启动计时均为**阶段观测**，不是系统/扩展进程启动到首次画面、也不是用户首次成功触摸的全链路时长。

## 诊断使用

1. 从独立 GitHub 测试分支安装 `Rime-startup-trace-0.3.46-preview.scripting`，不要替换正式 0.3.44 或既有的两个 A/B 对照项目。
2. 打开 `Rime启动诊断测试` 的设置界面 → **性能诊断** → 打开诊断开关。
3. 在 iOS 键盘设置切换到这一份测试键盘；反复关闭/再打开输入界面，以热启动做 10 次；之后重启 Scripting/设备，检查冷启动场景。
4. 返回诊断页点击“刷新上次启动记录”；一次启动只保留最后一次结果，因此需要在每次输入后观察/保存数据，不能当成十次样本历史。
5. 重点看 `ui.settings`/`ui.present`、`rime.setup`、`rime.schemas`、`t9.bridge`、`t9.fastpath`、`t9.deploy`、`rime.session`、`ui.firstPublished` 之间的间隔；如有 `input.firstBeforeReady`，说明首次按键发生在 Rime 尚未准备好时。
6. 测量结束后关闭诊断开关并清空记录；不改变键盘行为、不记录输入文字或候选内容。

## 内部契约

- `keyboard/runtime/StartupTrace.ts` 使用共享 Storage 专用开关，默认 false；启动时仅检查一次；关闭时不创建计时事件、不写任何记录。
- 开启后以 `performance.now()` 为优先计时来源，无此接口则回退 `Date.now()`；单次上限 48 个常量事件，结束时一次持久化覆盖上一条记录。
- 事件仅包含常量阶段名称和距进入 main() 的毫秒数；报告附加九键/26 键及就绪/失败/取消状态，不保存文本、候选、路径、Rime Schema ID、剪贴板或键盘内容。
- 跨 OS 的 ZIP 压缩字节不得当作源码同一性的标准；诊断预览包解压后每个文件字节校验，SHA256 以发布 Runner 实际输出为准。
- `ui.present.return` 不代表首帧；`ui.firstPublished` 也不代表 UI 绘制提交完成；`input.firstBeforeReady` 记录第一次未就绪按键（仍保持旧版直接忽略行为），未加入键盘输入队列。
- 每次诊断仅保留最近一次结果，不做长期写盘日志或后台定时采样。打开诊断会增加一次共享 Storage 读取、少量阶段时间读取及最后一次写入，因此必须对照关闭诊断状态测实际开销。

## 已验收

- Rime 44/44、打包工具 6/6；Node 启动事件、热/冷路径、取消与首次未就绪输入模拟验证通过；TypeScript 对照 13→13，新增 0。
- 未进行 iPhone 上的首次画面、冷启动 P50/P95、Rime 字典性能、CPU/RSS、内存回落的真实测量。

## 官方自动更新机制收口（0.3.46 Preview）

- Scripting script.json 的 remoteResource 配置 url 和 autoUpdateInterval（秒）；未设置间隔则禁用自动更新。
- 旧测试包 remoteResource=null，且以固定 Git SHA 提供安装包，所以此前不能依照我们发布的安装包配置自动更新。
- 只在生成的独立测试包内注入远程资源配置；正式脚本原始 script.json 保持 0.3.44 和 remoteResource=null。
- 自动更新固定 URL：https://raw.githubusercontent.com/riccilnl/my-scripting-widgets/refs/heads/perf/rime-startup-trace/previews/rime-startup-20261013/Rime-startup-trace-latest.zip
- 检查间隔为 3600 秒；这不是 iOS 后台准确计时或立即更新的保证。
- 打包时生成 0.3.46 Preview Scripting 安装包与 latest.zip，两个文件字节完全相同，项目名保持 Rime启动诊断测试。
- 旧 0.3.45 没有订阅元数据，需手动安装新包一次；以后必须提高 manifest 版本号并覆盖同一个 latest.zip 文件。
- Github Actions 仅向 perf/rime-startup-trace 测试分支发布，既有 main、正式 0.3.44 和 A/B 包不受影响。
- 目前手机 Scripting 连接离线，尚未真机确认是否按 App 期望的调度时机更新。

## 一键复制诊断报告（0.3.47 Preview）

- 在启动性能诊断页面新增“一键复制完整诊断报告”按钮，点按时重新读取最新已结束的诊断记录。
- 报告包含记录时间、输入布局、启动状态、全部阶段的累计时间与相邻阶段耗时，标明不含系统首帧。
- 使用官方 Pasteboard.setString 写入剪贴板，等待完成后反馈成功；失败或无记录均有提示。
- 不记录用户输入和候选词；纯报告格式化代码仅由设置页导入，不影响键盘初始加载链。
- 发布版本更新至 0.3.47，复用相同的 remoteResource/latest.zip 自动更新地址；正式 0.3.44 不变。

## 2026-10-13 iPhone 自动更新失败的真机复盘

- 手机 MCP 实际读取 Rime启动诊断测试 0.3.46 的 script.json，更新地址指向 Rime-startup-trace-0.3.46-preview.scripting，而非构建包内声明的 latest.zip。手机还保存了 remoteResource.hash。
- 更新失败直接原因：手机实际跟踪的是永远不变的定版安装文件。远端固定 latest.zip 已通过实际 HTTP 核验含 0.3.47。
- 永久规范：对用户只提供当前测试分支固定的 latest.zip URL 作为安装入口；定版 .scripting 与锁 SHA 的地址仅用于下载快照，不能作为自动更新订阅安装地址。
- 通过 Scripting MCP 精确编辑手机现有 script.json 的 remoteResource.url 为 latest.zip；保留 hash、3600 秒间隔和 0.3.46 版本。重新读取验证成功，scripting_validate 零错误。
- 本次尚须手机端主动检查更新后再读实际版本，不能在服务器构建成功时就推断手机更新成功。remoteResource.hash 算法未证实，不擅自清除。
- 不改变正式 0.3.44、原有键盘、词库或触摸行为。

## 2026-10-13 第二次真机核验：更新源 URL 被手机恢复

- Scripting MCP 再次实测：手机 0.3.46 的 remoteResource.url 从手动修正后的 latest.zip **恢复**为旧的 Rime-startup-trace-0.3.46-preview.scripting。因此编辑手机 script.json 不能保证更新管理器持续使用新地址。
- 未证实恢复机制来自 Scripting 更新缓存、安装元数据或文件自动同步；但旧文件仍是旧版本足以解释“最新版”的结果。
- 增设兼容更新别名：每次测试分支发布，同时覆盖 Rime-startup-trace-latest.zip 和原始 Rime-startup-trace-0.3.46-preview.scripting，校验二者字节一致；旧版本文件名现作为专用可变兼容入口，而非冻结快照。
- 以后每次测试发布都必须更新两个路径；其他带版本号的资源仍保持冻结快照，不再推荐作为自动更新订阅地址。
- 更新是否成功必须在手机实际检查更新后重新读取本地 script.json 验证；CI 成功不能代替手机更新状态。

## 0.3.48 Preview · 启动时间归因细化

- 新增 ui.root.render.begin / ui.root.hooksReady，辅助定位 present.return 到 effect.begin 的未归因间隔。注意首次 render 与 effect 之间仍包含调度等待，不代表纯 CPU 耗时。
- 新增 rime.schemaFilter.begin/end，区分原生 listSchemas 与 JS schema 筛选；不缓存 schema，不改变 Rime 行为。
- 保留单次诊断、默认关闭、最多 48 个事件、无逐键写盘。
- 诊断版提升至 0.3.48，继续覆盖 latest.zip 与手机已固定的 0.3.46 兼容订阅入口；正式 0.3.44 不变。
- 本次仍无法直接测量 iOS 扩展启动、首帧或内存回落；需手机实测。

## 0.3.51 预览版：剪贴板、常用语滚动命中区域修复

- 用户反馈：手指从内容行外的空白区域发起滑动，有时无法滚动。
- 源码原因：剪贴板 2px 行间距、常用语 6px 行间距与 12px 分类间距、分类侧栏 1px 间距，以及滚动区域内边距此前未保证完整命中；剪贴板行使用独占式 gesture 识别拖动。
- 修复：两面板的三个 ScrollView 覆盖透明矩形命中面；VStack 间距归零，原视觉间距改为有命中区域的行/分类容器内边距；分类侧栏整列 52px 可命中；剪贴板水平左滑改为 simultaneousGesture，与纵向滚动并行识别。
- 保留：点击插入、分类切换与滚动定位、左滑删除、历史清空、性能诊断及其默认关闭状态。
- 测试：Node 回归、源码结构契约、包内逐文件一致性；iPhone 真机须从内容行、行间、分类间及两侧留白纵向滑动，并测试水平左滑删除、点击插入、分类定位。
- 仅预览分支，正式 main 不变；CI 同时更新 latest.zip 与 0.3.46 固定别名订阅，预览版本 0.3.51。

## 0.3.53 Preview — 冷启动归因第二阶段（2026-10-13）

### 真机数据基线

- 用户提交正式 0.3.52 九键热启动：JS 88 ms；UI present.return→effect.begin 73 ms，Rime Session 2 ms，schema 0 ms。
- 用户提交正式 0.3.52 九键首次冷启动：JS 391 ms；Effect 等待 117 ms，Rime.setup 15 ms，Rime.listSchemas 72 ms，Session 包围区间 165 ms。单次样本不能推出稳定的 P50/P95，更不能把 JS 时间当成屏幕首帧时间。
- 已验证源码：new RimeEngine(new Rime.Session()) 中 RimeEngine 构造只保存原生引用，165 ms 主要落在 Rime.Session() 同步构造路径，但不能进一步推断原生内部的字典加载、内存分配、文件 I/O 各花费多少。
- Scripting 官方文档确认 Rime 是进程级引擎，Rime.setup() 一次初始化，Rime.Session 每次输入会话创建，用完应 close；Rime.isDeploying 仅表示观察瞬间的部署状态，不证明是哪项操作导致构造缓慢。参考：https://scriptingapp.github.io/zh/guide/Rime

### 诊断增强与边界

- 在不改变初始化顺序的情况下新增 rime.session.native.begin/end、rime.session.wrap.begin/end，旧 rime.session.begin/end 保留以便与历史报告直接比较。前者包括 JS→原生桥接开销，不能当作 librime 内部计时。
- 在 Rime schema 枚举前及 Session 构造前，各读取一次官方 Rime.isDeploying 同步状态，记录枚举或构造前的 busy/idle 常量事件。仅诊断开启时读取；无日志轮询。
- 复制报告增加初始化路径、瞬时部署状态以及关键耗时区间摘要；仍为报告格式 1，保持原全部时间事件，不泄漏输入、候选、schema ID、路径。
- 不修改 Rime.setup、listSchemas、Session 创建顺序、不复用/后台预热 Session；关闭诊断时不增加额外 Rime 状态读取、不会追加持久化写入。最近一次启动覆盖写入，最大 48 事件约束不变。
- 本轮只发布独立 Rime启动诊断测试 0.3.53 预览，正式 main 0.3.52 不变，继续覆盖 latest.zip 与手机旧 0.3.46 订阅兼容别名。

### 下一轮 iPhone 验收

1. 更新预览键盘至 0.3.53，在诊断设置里确认开关开启。
2. 连续热启动至少 5 次，分别复制每次结果，重点观察原生 Session 构造区间与 UI Effect 间隔。
3. 再测试至少 5 次真实引擎未初始化情形；以 rime.setup.begin 是否出现判断本轮是否执行 setup，不要用关闭再打开键盘直接断定系统进程已冷启动。必要时手动结束相关 App/扩展后测试，仍应以事件为准。
4. 对比 rime.deployStatus.beforeSchemas / beforeSession 和原生构造耗时；如果多次冷启动都约 150–200 ms 且部署 idle，下一步需要 Scripting 提供的原生性能工具/实现源码才能细分 librime 内部瓶颈，不应继续在 JS 层堆补丁。
5. 每次记录只保存最近一次；请连续复制多个报告，不要期望诊断开关后台自动积累十次记录。

## Lazy 布局实验取消（2026-10-14）

- 用户反馈 iPhone 节能模式影响键盘启动速度，决定停止 Lazy 布局 A/B 实验。这是用户的实际观察，不把它写成已量化证实的唯一性能原因。
- 删除 0.3.54 LazyVGrid / 普通 VStack+HStack A/B 安装包及其专用打包、校验、布局替换、实验文档和 CI 发布步骤。保留原始 LazyVGrid 候选面板，不合入普通布局。
- 保留正式 main 0.3.52、现有启动诊断预览 0.3.53、latest.zip 与旧 0.3.46 兼容订阅；历史 Git 提交可追溯，但当前分支不再发布这两个实验包。
- 以后比较键盘性能时首先记录节能模式开关状态，保持温度、负载和电源条件相近，避免将系统调度差异误判为代码回归。

## 0.3.54 Preview · 候选栏独立更新（2026-10-14）

- 0.3.53 原生 Session 冷启动阶段诊断埋点保留；本阶段不修改初始化顺序。
- 引入仅内存的 CandidateViewStore 和 CandidateBarSubscriber，候选文本、高亮变化不再直接更新 KeyboardRoot；根组件仅保留 0/1/2/3+ 的空格滑动候选阈值。原 CandidateBar 触摸几何文件保持冻结。
- 版本升至 0.3.54；现有预览最新 ZIP、手机 0.3.46 旧文件名兼容地址继续同步发布；正式 main 0.3.52 不改。
- 本阶段性能提升是需要 iPhone 真机证实的假设。必须验收 26 键、九键、空格上/下滑候选、展开列表、剪贴板及首次输入；节能模式开关保持固定。
- 独立契约、测试与回退说明：见 CANDIDATE_RENDER_0.3.54_2026-10-14.md。

## 0.3.55 Preview · 九键拼音左列独立订阅（2026-10-14）

- 0.3.54 已隔离候选栏文本/高亮，但九键拼音选项还会更新 KeyboardRoot 的 state，引发无关视图计算。0.3.55 引入纯内存 Store + Subscriber。
- 原九键拼音列组件、候选栏触摸几何、T9 Lua、Rime Session、启动诊断、ActionQueue 不改；ASCII 模式保留标点列表。
- 性能收益需要真机验证；iPhone 节能模式固定后再比较，不声称启动时间改变，也不引入 iOS 27 TouchGesture。
- 预览独立发布 0.3.55，latest.zip 与旧 0.3.46 订阅兼容别名必须同步；正式 0.3.52 保持不变。
- 独立契约和回退步骤见 CANDIDATE_RENDER_0.3.55_2026-10-14.md。

## 0.3.56 Preview · 工具栏节点开关（2026-10-14）

- 默认开启的「显示工具栏（性能对照）」设置只对空闲状态的自定义工具栏生效；关闭时不挂载自定义工具栏/候选栏订阅包装，而是使用等高空白保持所有按键坐标不变。
- 输入中的候选词、候选展开、加载及错误提示照常显示。旧设置默认显示，调整工具栏配置后不能复位开关。
- 与「显示按键角标」独立开/关比较，不能据此单一感受认定转圈原因。iPhone 真机尚未验收。
- 更新 Rime 启动诊断测试 0.3.56 预览及旧固定 URL 兼容别名；保留 0.3.55 快照，正式 main 0.3.52 不改。详情见 TOOLBAR_VISIBILITY_0.3.56_2026-10-14.md。

## 0.3.57 Preview · 固定键盘入口收敛（2026-10-14）

- Scripting 固定键盘入口 keyboard.tsx，原文件仅静态导入 keyboard/main.tsx；现将实现直接移入 keyboard.tsx，删除中转层。
- 修正 37 处相对模块引用，保留原生命周期与诊断标记。性能影响预计微小，不能当作转圈问题已修复。
- 只在独立预览版 0.3.57 验收，正式 main 0.3.52 不变。详情见 KEYBOARD_ENTRY_0.3.57_2026-10-14.md。

## 启动链路 A/B 静态依赖对照（2026-10-14）

最初肉眼观察万象似乎直接显示，录屏后来证实它也转圈但更快。历史实验新建独立冻结脚本：保留完整依赖但呈现极简键盘（A），与只有三文件和相同极简键盘（B）。既有 Rime 启动诊断 0.3.57 作为完整键盘对照 C。具体安装、局限和判定条件见 STARTUP_AB_CONTROLS_2026-10-14.md。未修改原始键盘入口及功能。

## 2026-10-15 视频复核：实验成功条件重定义

- 用户重新录屏确认：万象助手、Rime A/B、完整版 Rime 均出现启动转圈；区别是万象转圈较短，键盘展开时脚本界面已显示。“万象不转圈”“A 不转圈”的结论撤销。
- 不能再以“是否转圈”作为启动优化验收标准。目标改为外部系统键盘切入 Scripting 到脚本首帧和可输入的耗时，并区分系统展开动画与真正可交互时刻。
- 现有 JS trace 从 main() 内才开始，不含扩展激活、静态模块解析和系统首帧。录屏未提供给开发环境，尚无精确的比较毫秒数，不能声称性能修复。
- 原生 toolbar/requestHeight 只是假设差异，不是已证原因；取消未发布的 W/T/H 原生选项控制方案，不扩大只看转圈有无的无效实验。
- 正式 main 和既有预览 0.3.57、冻结 A/B 均保持不变。未来执行遵循 STARTUP_FIRST_FRAME_BASELINE_2026-10-15.md。
