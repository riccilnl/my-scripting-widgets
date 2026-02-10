import { Navigation, Script, NavigationStack, List, Button, Text, VStack, Spacer, HStack } from "scripting"
import { StockSettingsPage } from "./src/components/StockSettingsPage"
import { StockRow } from "./src/components/StockRow"
import { StockManager } from "./src/core/StockManager"
import { CacheManager } from "./src/utils/cache"
import { Stock } from "./src/types/stock"
import { useState, useEffect } from "scripting"

/**
 * 主页面 - 显示股票信息列表
 */
function MainPage() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const dismiss = Navigation.useDismiss()

  // 加载股票数据
  const loadStockData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // 使用 StockManager 的公共方法获取数据
      const freshData = await StockManager.getDisplayData()
      setStocks(freshData)
    } catch (error) {
      console.error("Failed to load stock data:", error)
      setError("加载股票数据失败")

      // 尝试使用缓存数据作为后备
      const cachedData = StockManager.getCachedData()
      if (cachedData.length > 0) {
        setStocks(cachedData)
        setError("显示缓存数据")
      }
    } finally {
      setIsLoading(false)
    }
  }

  // 页面加载时获取数据
  useEffect(() => {
    loadStockData()
  }, [])

  const openSettings = async () => {
    try {
      await Navigation.present(<StockSettingsPage />)
      // 从设置页面返回后重新加载数据
      await loadStockData()
    } catch (error) {
      console.error("Failed to open settings:", error)
      setError("打开设置页面失败")
    }
  }

  const refreshData = async () => {
    await loadStockData()
  }

  const cacheStatus = StockManager.getCacheStatus()

  return (
    <NavigationStack>
      <List
        navigationTitle="新浪美股"
        toolbar={{
          cancellationAction: <Button title="关闭" action={dismiss} />,
          topBarTrailing: (
            <Button
              title="添加股票"
              systemImage="plus"
              action={openSettings}
              buttonStyle="borderedProminent"
            />
          ),
        }}
      >
        <VStack spacing={10} alignment="leading" padding={12}>
          {isLoading ? (
            <VStack alignment="center" spacing={8}>
              <Text foregroundStyle="secondaryLabel">正在加载股票数据...</Text>
            </VStack>
          ) : stocks.length === 0 ? (
            <VStack alignment="center" spacing={8}>
              <Text foregroundStyle="secondaryLabel">暂无股票数据</Text>
              <Text font="caption" foregroundStyle="tertiaryLabel">
                点击右上角"添加股票"按钮配置您关注的股票
              </Text>
              <Button
                title="重试"
                action={refreshData}
              />
            </VStack>
          ) : (
            <>
              {/* 错误提示 */}
              {error && (
                <VStack alignment="center" spacing={4} padding={8}>
                  <Text font="caption" foregroundStyle="orange">
                    {error}
                  </Text>
                </VStack>
              )}

              {/* 股票列表 */}
              {stocks.map((stock: Stock) => (
                <StockRow key={stock.symbol} stock={stock} size="large" />
              ))}

              {/* 底部信息 */}
              <Spacer minLength={8} />
              <VStack spacing={4} alignment="leading">
                <HStack alignment="center" frame={{ maxWidth: Infinity }}>
                  <Text opacity={0.6} font={{ name: "system", size: 12 }}>
                    {cacheStatus.timestamp || "实时数据"}
                  </Text>
                  <Spacer />
                  <Button
                    title="刷新"
                    action={refreshData}
                    buttonStyle="bordered"
                  />
                </HStack>

                <HStack alignment="center" frame={{ maxWidth: Infinity }}>
                  <Text opacity={0.5} font={{ name: "system", size: 10 }}>
                    共 {stocks.length} 只股票
                    {cacheStatus.isExpired && " (数据可能过期)"}
                  </Text>
                </HStack>
              </VStack>
            </>
          )}
        </VStack>
      </List>
    </NavigationStack>
  )
}

/**
 * 运行主页面
 */
async function run(): Promise<void> {
  try {
    await Navigation.present(<MainPage />)
  } catch (error) {
    console.error("Failed to present main page:", error)
  } finally {
    Script.exit()
  }
}

// 执行
run()