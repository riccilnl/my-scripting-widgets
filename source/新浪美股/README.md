# 新浪美股小组件

一个功能强大的美股小组件，支持自定义股票代码管理。

## 功能特性

- 📈 实时显示美股价格和涨跌幅
- ⚙️ 自定义股票代码管理
- 💾 智能缓存机制
- 🔄 自动数据更新
- 📱 美观的iOS原生界面

## 使用方法

### 1. 打开设置页面

运行 `index.tsx` 文件来打开主页面，然后点击"添加股票"按钮。

### 2. 管理股票代码

在设置页面中，您可以：

- **添加股票代码**：在文本框中输入美股代码（如 AAPL、TSLA 等），点击"添加"按钮
- **删除股票代码**：在当前股票列表中点击"删除"按钮移除不需要的股票
- **重置配置**：点击"重置为默认配置"恢复到初始的5只股票

### 3. 查看小组件

设置完成后，小组件会自动显示您配置的股票代码及其实时价格信息。

## 股票代码格式

- 美股代码通常为1-5个英文字母
- 代码会自动转换为大写显示
- 支持所有在新浪财经有数据的美股代码

## 默认股票代码

小组件默认包含以下5只热门美股：

- MSFT - 微软
- AAPL - 苹果
- AMZN - 亚马逊
- GOOG - 谷歌
- TSLA - 特斯拉

## 文件结构

```
├── src/
│   ├── core/
│   │   ├── StockManager.ts          # 股票数据管理器
│   │   └── StockConfigManager.ts    # 股票配置管理器
│   ├── components/
│   │   ├── StockWidget.tsx          # 小组件UI组件
│   │   ├── StockRow.tsx             # 股票行组件
│   │   ├── StockSettingsPage.tsx    # 设置页面组件
│   │   ├── SmallStockWidget.tsx     # 小号小组件
│   │   ├── MediumStockWidget.tsx    # 中号小组件
│   │   ├── LargeStockWidget.tsx     # 大号小组件
│   │   └── AdaptiveStockWidget.tsx  # 自适应小组件
│   ├── services/
│   │   └── stockService.ts          # 股票数据服务
│   ├── utils/
│   │   ├── cache.ts                 # 缓存工具
│   │   └── number.ts                # 数字格式化工具
│   ├── types/
│   │   └── stock.ts                 # 类型定义
│   ├── config/
│   │   └── constants.ts             # 常量配置
│   └── scripts/
│       └── openSettings.tsx         # 打开设置脚本
├── index.tsx                        # 主页面入口
├── widget.tsx                        # 小组件入口
└── README.md                         # 说明文档
```

## 技术特点

- **模块化架构**：清晰的代码结构，易于维护和扩展
- **类型安全**：完整的TypeScript类型定义
- **错误处理**：完善的异常处理机制
- **性能优化**：智能缓存和数据更新策略
- **用户体验**：直观的设置界面和流畅的交互

## 注意事项

- 股票数据来源于新浪财经，请确保网络连接正常
- 小组件会自动缓存数据，在网络不佳时显示缓存内容
- 建议定期更新股票代码以获取最新信息

## 开发说明

如需修改或扩展功能，请参考以下文件：

- `src/core/StockConfigManager.ts`：管理用户配置的股票代码
- `src/components/StockSettingsPage.tsx`：设置页面的UI和交互逻辑
- `src/core/StockManager.ts`：股票数据获取和显示逻辑