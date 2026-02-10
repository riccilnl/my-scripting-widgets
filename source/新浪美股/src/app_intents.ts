import { AppIntentManager, AppIntentProtocol } from "scripting"
import { StockManager } from "./core/StockManager"

/**
 * 刷新股票数据的意图
 */
export const RefreshStocksIntent = AppIntentManager.register({
    name: "RefreshStocksIntent",
    protocol: AppIntentProtocol.AppIntent,
    perform: async () => {
        console.log("[RefreshStocksIntent] 用户触发刷新")
        await StockManager.forceRefresh()
    }
})
