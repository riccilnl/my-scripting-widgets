import { StockManager } from "./src/core/StockManager"
import { presentStockWidget } from "./src/components/StockWidget"

/**
 * 新浪美股Widget入口
 * 使用模块化架构，提高代码可维护性和稳定性
 */
async function main(): Promise<void> {
  // 分离数据获取与展示逻辑
  const data = await StockManager.getDisplayData()
  presentStockWidget(data)
}

// 执行主函数
main().catch(error => {
  console.error("Widget execution failed:", error)
})