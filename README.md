# My Scripting Widgets

Scripting App 小组件集合

## 包含的小组件

### 1. 财联社电报 📰
实时显示财联社电报新闻，支持小号/中号/大号三种尺寸。
- 自动缓存，离线可查看
- HTML实体解码
- 智能过滤电报前缀

### 2. IP检测 🌐
智能IP检测与代理识别小组件。
- 多源IP对比检测分流代理
- VPN状态识别
- 风险评分系统
- 国旗显示

### 3. 新浪美股 📈
实时美股行情小组件。
- 支持多股显示
- 价格区间可视化
- 红涨绿跌渐变背景
- 自动刷新缓存

### 4. 金投行情 🪙
金投行情报价小组件，支持自选品种与组件配置。
- 小号/中号组件可选品种并带预览
- 支持品种分类筛选
- 自动刷新间隔设置
- 实时行情与涨跌显示

## 发布脚本说明

项目根目录提供了自动打包脚本 `scripts/update_links.js`。

- 自动扫描 `scripts/<项目名>/` 下包含 `script.json` 的源码项目。
- 校验 `script.json` 中的 `entry` 入口文件。
- 在根目录生成对应的 `<项目名>.scripting` 文件。
- 保留没有对应源码目录的手动 `.scripting` 文件。
- 根据根目录全部 `.scripting` 文件更新快速安装区。

使用方式：

```bash
node scripts/update_links.js
```

<!-- INSTALL_LINKS_START -->

## 快速安装

点击下方链接直接下载安装：

- [IP检测](https://github.com/riccilnl/my-scripting-widgets/raw/main/IP%E6%A3%80%E6%B5%8B.scripting)
- [Navidrome播放器](https://github.com/riccilnl/my-scripting-widgets/raw/main/Navidrome%E6%92%AD%E6%94%BE%E5%99%A8.scripting)
- [ScriptingPlus](https://github.com/riccilnl/my-scripting-widgets/raw/main/ScriptingPlus.scripting)
- [rime输入法](https://github.com/riccilnl/my-scripting-widgets/raw/main/rime%E8%BE%93%E5%85%A5%E6%B3%95.scripting)
- [新浪美股](https://github.com/riccilnl/my-scripting-widgets/raw/main/%E6%96%B0%E6%B5%AA%E7%BE%8E%E8%82%A1.scripting)
- [财联社](https://github.com/riccilnl/my-scripting-widgets/raw/main/%E8%B4%A2%E8%81%94%E7%A4%BE.scripting)
- [金投行情](https://github.com/riccilnl/my-scripting-widgets/raw/main/%E9%87%91%E6%8A%95%E8%A1%8C%E6%83%85.scripting)

**安装步骤：**
1. 点击上方链接
2. 在 Safari 中打开链接
3. 点击 "在 Scripting 中打开"
4. 自动导入完成

或者复制链接地址，在 Scripting App 中点击 "+" → "从 GitHub 安装"，粘贴链接即可。

<!-- INSTALL_LINKS_END -->

## 更新日志

### v1.0.1
- 新增金投行情小组件
### v1.0.0
- 新增财联社、IP检测、新浪美股

## License

MIT
