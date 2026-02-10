// 数字处理工具函数

/**
 * 安全地将任意值转换为数字
 * @param v 要转换的值
 * @returns 转换后的数字，如果无效则返回null
 */
export function safeNum(v: unknown): number | null {
  if (v === null || v === undefined) {
    return null
  }
  
  const str = String(v).trim()
  if (str === '') {
    return null
  }
  
  // 移除千位分隔符和其他非数字字符（除了小数点和负号）
  const cleanStr = str.replace(/[^\d.-]/g, '')
  
  const n = parseFloat(cleanStr)
  return Number.isFinite(n) ? n : null
}

/**
 * 将数字四舍五入到指定小数位
 * @param n 要处理的数字
 * @param decimals 小数位数，默认2位
 * @returns 四舍五入后的数字
 */
export function roundToDecimals(n: number, decimals: number = 2): number {
  if (!Number.isFinite(n)) {
    return 0
  }
  
  const factor = Math.pow(10, decimals)
  return Math.round(n * factor) / factor
}

/**
 * 格式化数字显示
 * @param v 要格式化的数字
 * @param digits 小数位数，默认2位
 * @returns 格式化后的字符串
 */
export function formatNumber(v: number | null | undefined, digits: number = 2): string {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return "--"
  }
  
  // 对于大数字，使用适当的格式
  if (Math.abs(v) >= 1000000) {
    return (v / 1000000).toFixed(digits) + "M"
  } else if (Math.abs(v) >= 1000) {
    return (v / 1000).toFixed(digits) + "K"
  }
  
  return v.toFixed(digits)
}

/**
 * 格式化价格显示（股票专用）
 * @param v 要格式化的价格
 * @param digits 小数位数，默认2位
 * @returns 格式化后的价格字符串
 */
export function formatPrice(v: number | null | undefined, digits: number = 2): string {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return "--"
  }
  
  return v.toFixed(digits)
}

/**
 * 格式化涨跌幅显示
 * @param v 要格式化的涨跌幅
 * @param digits 小数位数，默认2位
 * @returns 格式化后的涨跌幅字符串
 */
export function formatPercent(v: number | null | undefined, digits: number = 2): string {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return "--%"
  }
  
  const sign = v >= 0 ? "+" : ""
  return sign + v.toFixed(digits) + "%"
}

/**
 * 计算涨跌幅百分比
 * @param change 涨跌额
 * @param currentPrice 当前价格
 * @returns 涨跌幅百分比
 */
export function calculateChangePercent(change: number, currentPrice: number): number {
  if (!Number.isFinite(change) || !Number.isFinite(currentPrice) || currentPrice === 0) {
    return 0
  }
  
  return (change / currentPrice) * 100
}

/**
 * 判断数字是否为正数
 * @param n 要判断的数字
 * @returns 是否为正数
 */
export function isPositive(n: number | null | undefined): boolean {
  return typeof n === "number" && Number.isFinite(n) && n > 0
}

/**
 * 判断数字是否为负数
 * @param n 要判断的数字
 * @returns 是否为负数
 */
export function isNegative(n: number | null | undefined): boolean {
  return typeof n === "number" && Number.isFinite(n) && n < 0
}

/**
 * 判断数字是否为零
 * @param n 要判断的数字
 * @returns 是否为零
 */
export function isZero(n: number | null | undefined): boolean {
  return typeof n === "number" && Number.isFinite(n) && n === 0
}

/**
 * 获取数字的颜色类型（用于涨跌显示）
 * @param n 要判断的数字
 * @returns 颜色类型
 */
export function getNumberColorType(n: number | null | undefined): 'positive' | 'negative' | 'neutral' {
  if (isPositive(n)) return 'positive'
  if (isNegative(n)) return 'negative'
  return 'neutral'
}

/**
 * 限制数字在指定范围内
 * @param n 要限制的数字
 * @param min 最小值
 * @param max 最大值
 * @returns 限制后的数字
 */
export function clampNumber(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/**
 * 安全地进行数字运算
 * @param a 第一个数字
 * @param b 第二个数字
 * @param operation 运算类型
 * @returns 运算结果
 */
export function safeMathOperation(
  a: number | null | undefined, 
  b: number | null | undefined, 
  operation: 'add' | 'subtract' | 'multiply' | 'divide'
): number | null {
  if (typeof a !== "number" || !Number.isFinite(a) ||
      typeof b !== "number" || !Number.isFinite(b)) {
    return null
  }
  
  switch (operation) {
    case 'add':
      return a + b
    case 'subtract':
      return a - b
    case 'multiply':
      return a * b
    case 'divide':
      return b !== 0 ? a / b : null
    default:
      return null
  }
}