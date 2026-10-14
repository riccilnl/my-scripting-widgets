# Rime 0.3.55 Preview · 九键拼音选项独立更新（2026-10-14）

## 目标与缘由

BlackCCCat 4.0.1 的局部候选订阅提供了有用的设计参考，但不移植其主键盘模块结构。0.3.54 已隔离水平候选栏，九键左侧拼音选项仍使用 KeyboardRoot 的 useState，选项频繁变化会连带重新执行根组件的渲染计算。本版只隔离九键拼音列表，保留正式版 0.3.52 和所有现有触摸行为。

## 唯一行为变更

- 新增 T9PinyinViewStore：仅驻内存，保存字符串列表；相同内容不通知，只在列表内容变化时通知；订阅早晚均可读取最新快照。
- 新增 T9PinyinColumnSubscriber：只为九键左侧列订阅数据，卸载后取消订阅；ASCII 模式显示原标点列表，返回中文显示现有拼音选项。
- KeyboardRoot 在 publish() 中调用 t9PinyinStore.publish()，不再保留 t9PinyinOptions 的根 state；组件退出时 dispose Store。
- 原有九键拼音列 T9PinyinColumn.tsx 完全不变：选词、标点、滚动、4格可见高度和完整命中范围保持。
- CandidateBar、RimeEngine、RimeRuntimeCoordinator、T9BridgeAsset、TouchIntentMachine、ActionQueue、普通键盘布局、展开候选网格都不改变。
- 不使用 Thread.runInBackground 跨线程转移原生 Session；不增加 Storage 写盘、网络请求、日志文本或输入内容采样。
- 减少无关根渲染是设计目标，不声称已经证实真机输入延迟改善，更不将 JS startup.ready 与键盘首帧等同。

## 验收与回退

- Node 回归包括九键 Store：重复列表抑制，相同长度不同内容更新，早期启动读取，退订，dispose 后无通知；静态契约还检查 ASCII 中文切换和冻结原始 T9PinyinColumn。
- 运行 node --test scripts/rime输入法/tests/runtime.test.cjs、node --test scripts/update_links.test.js、打包验证、git diff --check；CI 发布 0.3.55，并让 latest.zip 与旧 0.3.46 文件名兼容订阅保持字节一致。
- iPhone 仅安装“Rime启动诊断测试”0.3.55。测试九键连续输入、拼音选择、英文/中文切换、空格候选滑动、清空组合、九键标点、候选展开滚动；26键、剪贴板、常用语不得回归。
- 固定节能模式、温度、系统负载、输入应用后对比；真机未验收前不进入正式 main。
- 如果候选错位、首次输入丢失、拼音列停滞，请通过 GitHub 已保留的 0.3.54 版本快照回退；保留故障报告并停止合入。
