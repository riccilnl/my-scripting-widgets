import { Stock } from "../types/stock"
import { StockService } from "../services/stockService"
import { CacheManager } from "../utils/cache"
import { StockConfigManager } from "./StockConfigManager"
import { ErrorHandler } from "../utils/errorHandler"

/**
 * 股票管理器 - 协调数据获取、缓存和显示
 */
export class StockManager {
  /**
   * 获取用于显示的股票数据
   * @returns 股票数据数组
   */
  static async getDisplayData(): Promise<Stock[]> {
    try {
      const cachedData = CacheManager.loadCache()

      if (cachedData.length > 0 && !CacheManager.isCacheExpired()) {
        console.log("Using cached data")
        return cachedData
      }

      const freshData = await this.fetchFreshData()

      if (freshData.length > 0) {
        CacheManager.saveCache(freshData)
        return freshData
      }

      return cachedData.length > 0 ? cachedData : []
    } catch (error) {
      ErrorHandler.handle(error, "StockManager.getDisplayData")
      return CacheManager.loadCache()
    }
  }

  /**
   * 获取最新股票数据
   */
  static async fetchFreshData(): Promise<Stock[]> {
    try {
      const symbols = StockConfigManager.getStockSymbols()
      if (symbols.length === 0) return []
      return await StockService.fetchMultipleStocks(symbols)
    } catch (error) {
      ErrorHandler.handle(error, "StockManager.fetchFreshData")
      return []
    }
  }

  /**
   * 强制刷新并返回数据
   */
  static async forceRefresh(): Promise<Stock[]> {
    try {
      const freshData = await this.fetchFreshData()
      if (freshData.length > 0) {
        CacheManager.saveCache(freshData)
        return freshData
      }
      return CacheManager.loadCache()
    } catch (error) {
      ErrorHandler.handle(error, "StockManager.forceRefresh")
      return CacheManager.loadCache()
    }
  }

  // ... 其余辅助方法保持不变 (省略)
  static getCachedData(): Stock[] { return CacheManager.loadCache() }
  static isCacheExpired(maxAge?: number): boolean { return CacheManager.isCacheExpired(maxAge) }
  static getCacheStatus() {
    const cachedData = CacheManager.loadCache()
    return {
      hasData: cachedData.length > 0,
      timestamp: CacheManager.getCacheTimestamp(),
      isExpired: CacheManager.isCacheExpired(),
      stockCount: cachedData.length
    }
  }
}