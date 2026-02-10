import { VStack, HStack, Text, Spacer } from "scripting"
import { Stock } from "../types/stock"
import { StockRow } from "./StockRow"
import { CacheManager } from "../utils/cache"
import { UI_CONFIG } from "../config/constants"

interface MediumStockWidgetProps {
  stocks: Stock[]
}

/**
 * 中号股票Widget组件 - 单列列表布局，最多显示7个股票
 */
export function MediumStockWidget({ stocks }: MediumStockWidgetProps): JSX.Element {
  const displayStocks = stocks.slice(0, UI_CONFIG.MAX_DISPLAY_STOCKS_MEDIUM)
  const cacheTimestamp = CacheManager.getCacheTimestamp()

  if (!stocks || stocks.length === 0) {
    return (
      <VStack alignment="center" padding={UI_CONFIG.PADDING_MEDIUM} safeAreaPadding>
        <Text foregroundStyle="systemRed">数据加载失败</Text>
        <Text font={{ name: "system", size: 12 }}>请检查网络连接</Text>
      </VStack>
    )
  }

  return (
    <VStack
      spacing={0}
      alignment="leading"
      padding={{ top: UI_CONFIG.PADDING_MEDIUM, bottom: UI_CONFIG.PADDING_MEDIUM, leading: 0, trailing: 0 }}
      safeAreaPadding
      background="systemBackground"
    >
      <VStack spacing={UI_CONFIG.SPACING_MEDIUM}>
        {displayStocks.map((stock: Stock) => (
          <StockRow key={stock.symbol} stock={stock} size="medium" />
        ))}
      </VStack>
      <Spacer minLength={8} />
      <HStack alignment="center" frame={{ maxWidth: Infinity }}>
        <Text opacity={0.6} font={{ name: "system", size: 12 }}>
          {cacheTimestamp || "实时数据"}
        </Text>
      </HStack>
    </VStack>
  )
}