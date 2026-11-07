# Rime iOS 27 顶栏显示回归预览（0.3.61）

- 目标：针对 iOS 键盘扩展可能出现的顶部工具栏/候选栏空白症状验证修复；尚未确认 iOS 27.2 的系统根因。
- 改动：Rime 正在初始化或报错时仍保留自定义工具栏并显示状态；存在拼写但没有候选词时恢复工具栏；根据实际可用高度收缩键盘并顶部对齐，避免顶栏被裁切。
- 保护：独立键盘名「Rime顶栏诊断预览」，与正式「rime输入法」并存；不改变正式 main、原有字典、其他脚本。系统自带的 Scripting 工具栏继续按既有配置隐藏，以免重复。
- 版本：0.3.61；自动更新：3600 秒检查间隔；稳定安装文件：Rime-ios27-header-latest.scripting。
- 代码测试：node --test scripts/rime输入法/tests/runtime.test.cjs (51/51)；node --test scripts/update_links.test.js (6/6)；git diff --check。
- 发布限制：静态与 Node 级别验证不等于 iOS 27.2 真机验证；需要安装预览键盘，观察空闲、初始化、输入候选以及旋转/不同 App 的行为，确认后再决定是否合入正式版。
