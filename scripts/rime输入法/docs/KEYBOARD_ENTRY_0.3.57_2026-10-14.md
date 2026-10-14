# 0.3.57 预览：Scripting 键盘入口收敛

## 平台事实

Scripting dts/scripting.d.ts 的 Script.env 文档明确：keyboard.tsx 是自定义键盘扩展的固定入口；script.json 的 entry=index.tsx 只属于脚本主入口，不能据此删除 keyboard.tsx。

## 改动与不变量

- 原 keyboard.tsx 仅转发导入 keyboard/main.tsx。将 main.tsx 原样移动为 keyboard.tsx，所有 37 个相对模块引用随路径迁移修正；删除中转文件。
- CustomKeyboard.present、Rime 初始化、按键、触摸、九键、候选、工具栏开关、角标、诊断顺序均不改变；原始 script.json 和正式 main 0.3.52 不改。
- 更新静态测试的入口文件路径和诊断文案，安装包必须包含可直接执行的 keyboard.tsx，且不再包含 keyboard/main.tsx。
- 预览版本 0.3.57，仍使用已有稳定自动更新 URL 及手机历史 0.3.46 兼容别名；CI 仅在预览分支构建。

## 验收与限制

- 源码 37 个相对导入全部解析成功；Rime runtime 57/57、打包测试 6/6、0.3.57 安装包逐文件验证 PASS，88 个文件。
- 尚未验证 iPhone 实际键盘加载与转圈。删除一个静态导入层是结构清理，不应宣称性能改善。
- 不修改已有历史性能审计文档的当时源码路径描述；新版本入口路径由本记录说明。
