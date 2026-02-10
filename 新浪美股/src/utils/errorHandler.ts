/**
 * 错误处理工具类
 */
export class ErrorHandler {
  private static readonly ERROR_LOG_KEY = "error_logs"
  private static readonly MAX_ERROR_LOGS = 50

  /**
   * 处理并记录错误
   * @param error 错误对象
   * @param context 错误上下文
   * @param shouldThrow 是否重新抛出错误
   */
  static handle(error: unknown, context: string, shouldThrow: boolean = false): never | void {
    const errorInfo = this.formatError(error, context)
    
    // 记录错误日志
    this.logError(errorInfo)
    
    // 控制台输出
    console.error(`[${context}]`, error)
    
    if (shouldThrow) {
      throw error
    }
  }

  /**
   * 格式化错误信息
   * @param error 错误对象
   * @param context 错误上下文
   * @returns 格式化的错误信息
   */
  private static formatError(error: unknown, context: string): {
    timestamp: number
    context: string
    message: string
    stack?: string
    type: string
  } {
    const timestamp = Date.now()
    
    if (error instanceof Error) {
      return {
        timestamp,
        context,
        message: error.message,
        stack: error.stack,
        type: error.constructor.name
      }
    } else if (typeof error === 'string') {
      return {
        timestamp,
        context,
        message: error,
        type: 'StringError'
      }
    } else {
      return {
        timestamp,
        context,
        message: String(error),
        type: typeof error
      }
    }
  }

  /**
   * 记录错误日志
   * @param errorInfo 错误信息
   */
  private static logError(errorInfo: {
    timestamp: number
    context: string
    message: string
    stack?: string
    type: string
  }): void {
    try {
      const logs = this.getErrorLogs()
      logs.push(errorInfo)
      
      // 限制日志数量
      if (logs.length > this.MAX_ERROR_LOGS) {
        logs.splice(0, logs.length - this.MAX_ERROR_LOGS)
      }
      
      Storage.set(this.ERROR_LOG_KEY, logs)
    } catch (e) {
      console.error("Failed to log error:", e)
    }
  }

  /**
   * 获取错误日志
   * @returns 错误日志数组
   */
  static getErrorLogs(): Array<{
    timestamp: number
    context: string
    message: string
    stack?: string
    type: string
  }> {
    try {
      const logs = Storage.get(this.ERROR_LOG_KEY)
      return Array.isArray(logs) ? logs : []
    } catch (e) {
      console.error("Failed to get error logs:", e)
      return []
    }
  }

  /**
   * 清除错误日志
   */
  static clearErrorLogs(): void {
    try {
      Storage.remove(this.ERROR_LOG_KEY)
    } catch (e) {
      console.error("Failed to clear error logs:", e)
    }
  }

  /**
   * 获取最近的错误
   * @param count 错误数量
   * @returns 最近的错误数组
   */
  static getRecentErrors(count: number = 10): Array<{
    timestamp: number
    context: string
    message: string
    stack?: string
    type: string
  }> {
    const logs = this.getErrorLogs()
    return logs.slice(-count)
  }

  /**
   * 安全执行函数
   * @param fn 要执行的函数
   * @param context 错误上下文
   * @param defaultValue 默认返回值
   * @returns 函数执行结果或默认值
   */
  static async safeExecute<T>(
    fn: () => Promise<T> | T,
    context: string,
    defaultValue: T
  ): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      this.handle(error, context)
      return defaultValue
    }
  }

  /**
   * 创建带错误处理的异步函数
   * @param fn 原始函数
   * @param context 错误上下文
   * @param defaultValue 默认返回值
   * @returns 包装后的函数
   */
  static withErrorHandling<T>(
    fn: () => Promise<T> | T,
    context: string,
    defaultValue: T
  ): () => Promise<T> {
    return async (): Promise<T> => {
      return this.safeExecute(fn, context, defaultValue)
    }
  }

  /**
   * 检查是否为网络错误
   * @param error 错误对象
   * @returns 是否为网络错误
   */
  static isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      return (
        error.message.includes('network') ||
        error.message.includes('fetch') ||
        error.message.includes('timeout') ||
        error.message.includes('connection')
      )
    }
    return false
  }

  /**
   * 检查是否为解析错误
   * @param error 错误对象
   * @returns 是否为解析错误
   */
  static isParseError(error: unknown): boolean {
    if (error instanceof Error) {
      return (
        error.message.includes('parse') ||
        error.message.includes('JSON') ||
        error.message.includes('format')
      )
    }
    return false
  }

  /**
   * 获取用户友好的错误消息
   * @param error 错误对象
   * @param context 错误上下文
   * @returns 用户友好的错误消息
   */
  static getUserFriendlyMessage(error: unknown, context: string): string {
    if (this.isNetworkError(error)) {
      return "网络连接失败，请检查网络设置"
    }
    
    if (this.isParseError(error)) {
      return "数据解析失败，请稍后重试"
    }
    
    if (error instanceof Error) {
      return error.message
    }
    
    return `${context}操作失败，请稍后重试`
  }
}