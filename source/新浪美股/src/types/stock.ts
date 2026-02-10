// 股票相关类型定义
export type StockSymbol = string

export interface Stock {
  name: string
  symbol: StockSymbol
  currentPrice: number
  change: number
  changePercent: number
  high?: number
  low?: number
  open?: number
}

export interface StockConfig {
  symbol: StockSymbol
}

export interface ApiResponse {
  success: boolean
  data?: Stock[]
  error?: string
}

export interface CacheData {
  stocks: Stock[]
  timestamp: number
}

export type FetchResult = Promise<Stock | null>

export type StockDisplayData = {
  name: string
  symbol: string
  currentPrice: number
  change: number
  changePercent: number
}