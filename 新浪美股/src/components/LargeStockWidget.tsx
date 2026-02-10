import { VStack, HStack, Text, Spacer, Image } from "scripting"
import { Stock } from "../types/stock"
import { StockRow } from "./StockRow"
import { CacheManager } from "../utils/cache"
import { UI_CONFIG } from "../config/constants"

interface LargeStockWidgetProps {
  stocks: Stock[]
}

/**
 * 大号股票Widget组件 - 最多显示10个股票，字体与中号相同
 */
export function LargeStockWidget({ stocks }: LargeStockWidgetProps): JSX.Element {
  const displayStocks = stocks.slice(0, UI_CONFIG.MAX_DISPLAY_STOCKS_LARGE)
  const cacheTimestamp = CacheManager.getCacheTimestamp()

  if (!stocks || stocks.length === 0) {
    return (
      <VStack alignment="center" padding={12} safeAreaPadding>
        <Text foregroundStyle="systemRed">数据加载失败</Text>
        <Text font={{ name: "system", size: 12 }}>请检查网络连接</Text>
      </VStack>
    )
  }

  return (
    <VStack
      spacing={UI_CONFIG.SPACING_LARGE}
      alignment="leading"
      padding={2}
      background="systemBackground"
    >
      {/* 标题栏 */}
      <HStack
        alignment="center"
        padding={{ top: 19, bottom: 12, leading: 10, trailing: 10 }}
      >
        <Image
          systemName="chart.line.uptrend.xyaxis"
          font={18}
          foregroundStyle="#FF3B30"
        />
        <Text font={{ name: "system", size: 18 }} opacity={0.8} fontWeight="heavy">新浪美股</Text>
        <Spacer />
        <Text font={{ name: "system", size: 14 }} opacity={0.5}>{cacheTimestamp || "实时"}</Text>
      </HStack>

      {displayStocks.map((stock: Stock) => (
        <StockRow key={stock.symbol} stock={stock} size="large" />
      ))}
      <Spacer minLength={8} />
    </VStack>
  )
}