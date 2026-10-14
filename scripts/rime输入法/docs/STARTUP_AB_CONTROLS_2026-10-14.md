# Rime 启动转圈 A/B 控制实验（2026-10-14）

## 审计事实

用户 iPhone 录屏逐帧显示：Rime 自定义键盘会先进入 Scripting 键盘脚本加载画面并转圈，再出现完整键盘。之前的 36–37 ms 热启动指标从 JavaScript main 函数开始，不含扩展加载、静态模块解析或 iOS 屏幕首帧。

对照脚本是 BlackCCCat/Scripting-Scripts 的 Rime-Wanxiang-Updater，main 提交 14872fba44f310e2fd5fcfc30fd81be399439120。其 keyboard.tsx 在调用 CustomKeyboard.present 之前也加载静态模块并执行 runStorageMigration。用户在同一台手机观察到它可以直接显示。不能将所有转圈归因于 Scripting 通用行为。

Rime 0.3.57 的静态相关代码估算约 61 模块、272 KB；万象方案助手约 15 模块、138 KB。这是源码规模，而不是实际解释器加载时间。

## 控制变量

控制 A（Rime启动对照A / full-deps）保留 Rime 0.3.57 的全部源文件和静态依赖，包括原 KeyboardRoot 函数，但常规执行只挂载极简界面，绝不启动 Rime Session。为防止打包器裁剪所有原始依赖，KeyboardRoot 在无法正常触发的全局测试条件分支中保持引用。仍不保证底层解析器一定求值所有静态模块。

控制 B（Rime启动对照B / minimal-deps）只有三个文件：script.json、index.tsx、keyboard.tsx，不导入 Rime 相关模块。

两组的 index.tsx、首次 UI 的实际 JSX、setToolbarVisible(false)、requestHeight(260)、CustomKeyboard.present 完全一致。可见文案和“输入 A”按钮一致；测试名称不同以便用户识别。两组无输入日志、无字典写入、无自动更新。

基线 C 是已发布的 Rime启动诊断测试 0.3.57 原完整键盘。C 的设置读取、按键视图、Rime 初始化与键盘高度可能同时不同；如果 A/B 都比 C 快，不能独立证明 UI 是唯一原因。

## iPhone 验收步骤

1. 分别安装两个冻结安装包，不要覆盖原来的 Rime 或已在用的诊断脚本。两个安装包的 remoteResource 都为 null，不自动更新。
2. 在相同的输入框切换到 A，然后 B，点按“输入 A”按钮确认键盘可交互。记录脚本转圈画面的起止帧及首帧，避免只看 UI 的“ready”日志。
3. 节能模式固定，尽可能保持温度、电源与输入应用一致；以 A-B-B-A 等交替顺序，每个至少五轮。另对 C（现有 0.3.57）进行至少五轮。
4. 任何启用词库更新、删除用户词典、改变系统键盘权限的操作都不属于本实验。

## 结论判定

- B 不转圈、A 转圈：静态依赖或顶层模块求值成为首要嫌疑，仍需核实打包器优化/模块缓存。
- A/B 都不转圈、C 转圈：转向完整首帧 UI 树、主入口设置读取与原生配置调用、Rime Session 等因素；当前实验不能再细分。
- A/B 都转圈：对照宿主脚本选择和 Scripting 公共启动/缓存机制。
- A/B 转圈程度不同或结果不稳定：增加样本，先排除冷热缓存与节能模式因素。
- A 不转圈而 B 转圈：优先重复验收并检查实验环境，而不是反向断言复杂模块有性能收益。

## 构建、校验和发布契约

生成：python3 -B scripts/rime输入法/tests/create_startup_ab_previews.py
校验：python3 -B scripts/rime输入法/tests/verify_startup_ab_previews.py

CI 构建后发布在 previews/rime-startup-ab-20261014，使用固定版本号 0.1.0 的 .scripting 安装包与 SHA256SUMS。正式 main 和现有 Rime 0.3.57 latest.zip 不改变。生成时使用源文件重写打包内容，不改真实 keyboard.tsx、script.json 或输入行为。

实际 iOS 宿主冷启动、静态模块执行时序和首帧没有现成 JavaScript API；用户录屏逐帧是必要证据。
