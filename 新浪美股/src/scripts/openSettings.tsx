import { Navigation, Script } from "scripting"
import { StockSettingsPage } from "../components/StockSettingsPage"

/**
 * 打开股票设置页面
 */
async function openSettings(): Promise<void> {
  try {
    // 呈现设置页面
    await Navigation.present(<StockSettingsPage />)
  } catch (error) {
    console.error("Failed to open settings:", error)
  } finally {
    // 退出脚本以避免内存泄漏
    Script.exit()
  }
}

// 执行函数
openSettings()