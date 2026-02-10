import { StockConfig } from "../types/stock"
import { CacheManager } from "../utils/cache"

/**
 * 股票配置管理器 - 管理用户自定义的股票代码
 */
export class StockConfigManager {
  private static readonly STOCK_CONFIG_KEY = "user_stock_configs"
  private static readonly MAX_STOCKS = 20 // 最多支持20只股票

  /**
   * 获取用户配置的股票代码列表
   * @returns 股票配置数组
   */
  static getUserStockConfigs(): StockConfig[] {
    try {
      const configs = Storage.get<StockConfig[]>(this.STOCK_CONFIG_KEY)
      if (Array.isArray(configs) && configs.length > 0) {
        // 验证配置数据的有效性
        const validConfigs = configs.filter(config => 
          config && 
          typeof config.symbol === 'string' && 
          config.symbol.trim().length > 0
        ).map(config => ({
          symbol: config.symbol.trim().toLowerCase()
        }))
        
        // 如果有无效数据被过滤掉，保存清理后的配置
        if (validConfigs.length !== configs.length) {
          this.saveUserStockConfigs(validConfigs)
        }
        
        return validConfigs
      }
      return this.getDefaultStockConfigs()
    } catch (error) {
      console.error("getUserStockConfigs error:", error)
      return this.getDefaultStockConfigs()
    }
  }

  /**
   * 获取默认的股票配置
   * @returns 默认股票配置数组
   */
  static getDefaultStockConfigs(): StockConfig[] {
    return [
      { symbol: "msft" },
      { symbol: "aapl" },
      { symbol: "amzn" },
      { symbol: "goog" },
      { symbol: "tsla" }
    ]
  }

  /**
   * 保存用户配置的股票代码列表
   * @param configs 股票配置数组
   */
  static saveUserStockConfigs(configs: StockConfig[]): void {
    try {
      if (!Array.isArray(configs)) {
        throw new Error("Configs must be an array")
      }

      // 限制股票数量
      const limitedConfigs = configs.slice(0, this.MAX_STOCKS)
      
      Storage.set(this.STOCK_CONFIG_KEY, limitedConfigs)
      console.log(`Saved ${limitedConfigs.length} stock configs`)
    } catch (error) {
      console.error("saveUserStockConfigs error:", error)
      throw error
    }
  }

  /**
   * 添加股票代码
   * @param symbol 股票代码
   * @returns 操作结果
   */
  static addStockSymbol(symbol: string): { success: boolean; message: string } {
    try {
      const trimmedSymbol = symbol.trim()
      
      // 验证股票代码格式
      if (!this.isValidStockSymbol(trimmedSymbol)) {
        return { 
          success: false, 
          message: "股票代码格式无效，请输入1-5个英文字母" 
        }
      }

      const normalizedSymbol = trimmedSymbol.toLowerCase()
      const configs = this.getUserStockConfigs()
      
      // 检查是否已存在
      if (configs.some(config => config.symbol === normalizedSymbol)) {
        return { 
          success: false, 
          message: "该股票代码已存在" 
        }
      }

      // 检查是否超过最大数量
      if (configs.length >= this.MAX_STOCKS) {
        return { 
          success: false, 
          message: `最多只能添加${this.MAX_STOCKS}只股票` 
        }
      }

      // 添加新股票
      configs.push({ symbol: normalizedSymbol })
      this.saveUserStockConfigs(configs)
      
      // 清除数据缓存，确保获取新股票数据
      this.clearDataCache()
      
      return { 
        success: true, 
        message: `成功添加股票 ${normalizedSymbol.toUpperCase()}` 
      }
    } catch (error) {
      console.error("addStockSymbol error:", error)
      return { 
        success: false, 
        message: "添加股票失败，请重试" 
      }
    }
  }

  /**
   * 删除股票代码
   * @param symbol 股票代码
   * @returns 操作结果
   */
  static removeStockSymbol(symbol: string): { success: boolean; message: string } {
    try {
      const normalizedSymbol = symbol.trim().toLowerCase()
      const configs = this.getUserStockConfigs()
      const filteredConfigs = configs.filter(config => config.symbol !== normalizedSymbol)
      
      if (filteredConfigs.length === configs.length) {
        return { 
          success: false, 
          message: "未找到要删除的股票" 
        }
      }

      this.saveUserStockConfigs(filteredConfigs)
      
      // 清除数据缓存，确保移除股票数据
      this.clearDataCache()
      
      return { 
        success: true, 
        message: `成功删除股票 ${normalizedSymbol.toUpperCase()}` 
      }
    } catch (error) {
      console.error("removeStockSymbol error:", error)
      return { 
        success: false, 
        message: "删除股票失败，请重试" 
      }
    }
  }

  /**
   * 重置为默认配置
   * @returns 操作结果
   */
  static resetToDefault(): { success: boolean; message: string } {
    try {
      this.saveUserStockConfigs(this.getDefaultStockConfigs())
      
      // 清除数据缓存，确保获取默认股票数据
      this.clearDataCache()
      
      return { 
        success: true, 
        message: "已重置为默认配置" 
      }
    } catch (error) {
      console.error("resetToDefault error:", error)
      return { 
        success: false, 
        message: "重置配置失败，请重试" 
      }
    }
  }

  /**
   * 获取股票代码列表
   * @returns 股票代码字符串数组
   */
  static getStockSymbols(): string[] {
    return this.getUserStockConfigs().map(config => config.symbol)
  }

  /**
   * 验证股票代码格式
   * @param symbol 股票代码
   * @returns 是否有效
   */
  static isValidStockSymbol(symbol: string): boolean {
    const trimmedSymbol = symbol.trim()
    if (!trimmedSymbol) {
      return false
    }
    
    // 美股代码通常是1-5个字母
    return /^[a-zA-Z]{1,5}$/.test(trimmedSymbol)
  }

  /**
   * 获取配置统计信息
   * @returns 配置统计
   */
  static getConfigStats(): {
    totalCount: number
    maxCount: number
    isDefault: boolean
    symbols: string[]
  } {
    const configs = this.getUserStockConfigs()
    const defaultConfigs = this.getDefaultStockConfigs()
    
    return {
      totalCount: configs.length,
      maxCount: this.MAX_STOCKS,
      isDefault: JSON.stringify(configs) === JSON.stringify(defaultConfigs),
      symbols: configs.map(config => config.symbol.toUpperCase())
    }
  }

  /**
   * 清除数据缓存
   * 在股票配置变更后调用，确保获取最新数据
   */
  private static clearDataCache(): void {
    try {
      CacheManager.clearCache()
      console.log("Data cache cleared after stock config change")
    } catch (error) {
      console.error("clearDataCache error:", error)
      // 不抛出错误，因为缓存清除失败不应该影响配置保存
    }
  }
}