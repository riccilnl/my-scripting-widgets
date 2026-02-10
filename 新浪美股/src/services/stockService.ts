import { fetch } from "scripting"
import { API_CONFIG } from "../config/constants"
import { Stock, FetchResult } from "../types/stock"
import { safeNum, roundToDecimals, calculateChangePercent } from "../utils/number"
import { ErrorHandler } from "../utils/errorHandler"

/**
 * 股票数据服务
 */
export class StockService {
  /**
   * 批量获取股票数据 (性能优化：单一请求)
   * @param symbols 股票代码数组
   * @returns 股票数据数组
   */
  static async fetchMultipleStocks(symbols: string[]): Promise<Stock[]> {
    try {
      if (!symbols || symbols.length === 0) return [];

      // 构建批量请求 URL: list=gb_aapl,gb_msft...
      const queryList = symbols.map(s => `gb_${s.toLowerCase()}`).join(',');
      const url = `${API_CONFIG.BASE_URL}${queryList}`;

      const headers = {
        Referer: API_CONFIG.REFERRER_PREFIX,
        "User-Agent": API_CONFIG.USER_AGENT
      };

      console.log(`[BatchFetch] Requesting ${symbols.length} stocks: ${url}`);

      const response = await fetch(url, { headers, timeout: API_CONFIG.TIMEOUT });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for batch request`);
      }

      const buffer = await response.arrayBuffer();
      const data = Data.fromArrayBuffer(buffer);
      const text = data?.toRawString("gb18030");

      if (!text) {
        throw new Error("Empty response from batch API");
      }

      return this.parseBatchStockData(text, symbols);
    } catch (error) {
      ErrorHandler.handle(error, "StockService.fetchMultipleStocks");
      return [];
    }
  }

  /**
   * 解析批量股票数据流
   */
  private static parseBatchStockData(text: string, originalSymbols: string[]): Stock[] {
    const stocks: Stock[] = [];

    // 每行数据格式: var hq_str_gb_aapl="...";
    const lines = text.split(';').filter(line => line.trim().length > 0);

    lines.forEach(line => {
      try {
        const match = line.match(/var hq_str_gb_([a-z]+)="([^"]+)"/);
        if (!match) return;

        const symbol = match[1];
        const rawData = match[2];
        if (!rawData) return;

        const parts = rawData.split(',');
        if (parts.length < 35) return;

        const name = parts[0]?.trim() || symbol.toUpperCase();
        const currentPrice = safeNum(parts[1]);
        const changeRatio = safeNum(parts[2]);
        const change = safeNum(parts[4]);

        const open = safeNum(parts[5]);
        const high = safeNum(parts[6]);
        const low = safeNum(parts[7]);

        if (currentPrice === null || currentPrice <= 0) return;

        let changePercent = changeRatio;
        if (changePercent === null && change !== null) {
          changePercent = calculateChangePercent(change, currentPrice);
        }

        stocks.push({
          name: name,
          symbol: symbol.toLowerCase(),
          currentPrice: roundToDecimals(currentPrice),
          change: change !== null ? roundToDecimals(change) : 0,
          changePercent: changePercent !== null ? roundToDecimals(changePercent) : 0,
          open: open !== null ? roundToDecimals(open) : undefined,
          high: high !== null ? roundToDecimals(high) : undefined,
          low: low !== null ? roundToDecimals(low) : undefined
        });
      } catch (e) {
        console.error(`解析单行股票数据失败: ${line.substring(0, 30)}...`, e);
      }
    });

    return stocks;
  }

  /**
   * 验证股票数据 (保留供其他模块使用)
   */
  static isValidStock(stock: Stock): boolean {
    return !!(
      stock &&
      stock.symbol &&
      stock.name &&
      stock.currentPrice > 0
    );
  }

  /**
   * 获取服务状态
   */
  static getServiceStatus() {
    return {
      apiUrl: API_CONFIG.BASE_URL,
      isHealthy: true
    };
  }

  /**
   * 测试网络连接
   */
  static async testConnection(): Promise<{ success: boolean; message: string; latency?: number }> {
    try {
      const startTime = Date.now();
      const result = await this.fetchMultipleStocks(["aapl"]);
      const latency = Date.now() - startTime;

      return {
        success: result.length > 0,
        message: result.length > 0 ? "网络连接正常" : "无法获取测试数据",
        latency
      };
    } catch (error) {
      return { success: false, message: "网络连接测试失败" };
    }
  }
}