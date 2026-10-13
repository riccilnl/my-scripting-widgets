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
