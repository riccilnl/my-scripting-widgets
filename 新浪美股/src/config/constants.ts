// 应用常量配置
export const STOCKS = [
  { symbol: "msft" },
  { symbol: "aapl" },
  { symbol: "amzn" },
  { symbol: "goog" },
  { symbol: "tsla" },
  { symbol: "nvda" },
  { symbol: "meta" }
] as const

export const API_CONFIG = {
  BASE_URL: "https://hq.sinajs.cn/list=",
  REFERRER_PREFIX: "https://finance.sina.com.cn/stock/usstock/quotes/",
  TIMEOUT: 10000,
  USER_AGENT: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15"
} as const

export const CACHE_CONFIG = {
  DATA_KEY: "us_stock_cache_v2",
  TIMESTAMP_KEY: "us_stock_cache_ts_v2"
} as const

export const UI_CONFIG = {
  MAX_DISPLAY_STOCKS_SMALL: 1,
  MAX_DISPLAY_STOCKS_MEDIUM: 7,
  MAX_DISPLAY_STOCKS_LARGE: 7,
  DEFAULT_DECIMAL_PLACES: 2,
  SPACING: 0,
  SPACING_MEDIUM: 0,
  SPACING_LARGE: 0,
  PADDING: 8,
  PADDING_MEDIUM: 6
} as const