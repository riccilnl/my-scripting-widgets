import { CACHE_CONFIG } from "../config/constants"
import { Stock } from "../types/stock"

/**
 * 缓存管理工具
 */
export class CacheManager {
  private static readonly DATA_KEY = CACHE_CONFIG.DATA_KEY
  private static readonly TIMESTAMP_KEY = CACHE_CONFIG.TIMESTAMP_KEY
  private static readonly DEFAULT_CACHE_DURATION = 5 * 60 * 1000 // 5分钟

  /**
   * 保存股票数据到缓存
   * @param data 股票数据数组
   */
  static saveCache(data: Stock[]): void {
    try {
      if (!Array.isArray(data)) {
        throw new Error("Data must be an array")
      }

      // 验证数据有效性
      const validData = data.filter(stock => 
        stock && 
        typeof stock.symbol === 'string' && 
        stock.symbol.trim().length > 0 &&
        typeof stock.currentPrice === 'number' &&
        stock.currentPrice > 0
      )

      if (validData.length === 0) {
        console.warn("No valid stock data to cache")
        return
      }

      Storage.set(this.DATA_KEY, validData)
      Storage.set(this.TIMESTAMP_KEY, Date.now())
      console.log(`Cache saved: ${validData.length} stocks`)
    } catch (error) {
      console.error("saveCache error:", error)
      throw error
    }
  }

  /**
   * 从缓存加载股票数据
   * @returns 缓存的股票数据数组
   */
  static loadCache(): Stock[] {
    try {
      const data = Storage.get<Stock[]>(this.DATA_KEY)
      if (!Array.isArray(data)) {
        return []
      }

      // 验证缓存数据的有效性
      const validData = data.filter(stock => 
        stock && 
        typeof stock.symbol === 'string' && 
        stock.symbol.trim().length > 0 &&
        typeof stock.currentPrice === 'number' &&
        stock.currentPrice > 0
      )

      // 如果有无效数据，清理缓存
      if (validData.length !== data.length) {
        console.log(`Cleaned invalid cache entries: ${data.length - validData.length} removed`)
        this.saveCache(validData)
      }

      return validData
    } catch (error) {
      console.error("loadCache error:", error)
      return []
    }
  }

  /**
   * 获取缓存时间戳字符串
   * @returns 格式化的时间戳字符串
   */
  static getCacheTimestamp(): string | null {
    try {
      const timestamp = Storage.get<number>(this.TIMESTAMP_KEY)
      if (!timestamp || typeof timestamp !== 'number') {
        return null
      }
      
      const date = new Date(timestamp)
      if (isNaN(date.getTime())) {
        return null
      }

      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (error) {
      console.error("getCacheTimestamp error:", error)
      return null
    }
  }

  /**
   * 获取缓存时间戳（毫秒）
   * @returns 时间戳毫秒数
   */
  static getCacheTimestampMs(): number | null {
    try {
      const timestamp = Storage.get<number>(this.TIMESTAMP_KEY)
      return (typeof timestamp === 'number' && timestamp > 0) ? timestamp : null
    } catch (error) {
      console.error("getCacheTimestampMs error:", error)
      return null
    }
  }

  /**
   * 检查缓存是否过期
   * @param maxAge 最大缓存时间（毫秒），默认5分钟
   * @returns 是否过期
   */
  static isCacheExpired(maxAge: number = this.DEFAULT_CACHE_DURATION): boolean {
    try {
      const timestamp = this.getCacheTimestampMs()
      if (!timestamp) {
        return true
      }
      
      const now = Date.now()
      const age = now - timestamp
      
      return age > maxAge
    } catch (error) {
      console.error("isCacheExpired error:", error)
      return true
    }
  }

  /**
   * 获取缓存年龄（毫秒）
   * @returns 缓存年龄，如果没有缓存则返回null
   */
  static getCacheAge(): number | null {
    try {
      const timestamp = this.getCacheTimestampMs()
      if (!timestamp) {
        return null
      }
      
      return Date.now() - timestamp
    } catch (error) {
      console.error("getCacheAge error:", error)
      return null
    }
  }

  /**
   * 清除缓存
   */
  static clearCache(): void {
    try {
      Storage.remove(this.DATA_KEY)
      Storage.remove(this.TIMESTAMP_KEY)
      console.log("Cache cleared")
    } catch (error) {
      console.error("clearCache error:", error)
      throw error
    }
  }

  /**
   * 获取缓存状态信息
   * @returns 缓存状态对象
   */
  static getCacheStatus(): {
    hasData: boolean
    timestamp: string | null
    age: number | null
    isExpired: boolean
    stockCount: number
    size: string
  } {
    const data = this.loadCache()
    const timestamp = this.getCacheTimestamp()
    const age = this.getCacheAge()
    const isExpired = this.isCacheExpired()
    
    // 估算缓存大小
    const size = this.estimateCacheSize(data)

    return {
      hasData: data.length > 0,
      timestamp,
      age,
      isExpired,
      stockCount: data.length,
      size
    }
  }

  /**
   * 估算缓存大小
   * @param data 股票数据
   * @returns 格式化的大小字符串
   */
  private static estimateCacheSize(data: Stock[]): string {
    try {
      const jsonString = JSON.stringify(data)
      const bytes = jsonString.length * 2 // 粗略估算，每个字符2字节
      const kb = bytes / 1024
      return `${kb.toFixed(2)} KB`
    } catch (error) {
      return "Unknown"
    }
  }

  /**
   * 检查缓存是否健康
   * @returns 健康状态
   */
  static isCacheHealthy(): boolean {
    try {
      const data = this.loadCache()
      const timestamp = this.getCacheTimestampMs()
      
      return (
        data.length > 0 &&
        timestamp !== null &&
        timestamp > 0 &&
        !this.isCacheExpired()
      )
    } catch (error) {
      console.error("isCacheHealthy error:", error)
      return false
    }
  }
}