import { VStack, HStack, Text, Spacer } from "scripting"
import { Stock } from "../types/stock"
import { CacheManager } from "../utils/cache"
import { formatNumber } from "../utils/number"

interface SmallStockWidgetProps {
  stocks: Stock[]
}

/**
 * 小号股票Widget组件 - 只显示1个股票，特殊布局
 */
export function SmallStockWidget({ stocks }: SmallStockWidgetProps): JSX.Element {
  const displayStock = stocks[0] // 只显示第一个股票
  const cacheTimestamp = CacheManager.getCacheTimestamp()

  if (!stocks || stocks.length === 0) {
    return (
      <VStack alignment="leading" padding={8} safeAreaPadding>
        <Text foregroundStyle="systemRed" font={{ name: "system", size: 12 }}>加载失败</Text>
      </VStack>
    )
  }

  const isUp = displayStock.change >= 0
  const changeColor = isUp ? "systemRed" : "systemGreen"

  return (
    <VStack 
      spacing={6} 
      alignment="leading" 
      padding={8} 
      safeAreaPadding 
      background="systemBackground"
    >
      {/* 第一行：股票名称 - 左对齐，16px，加粗 */}
      <Text 
        font={{ name: "system", size: 16 }}
        fontWeight="bold"
        lineLimit={1}
      >
        {displayStock.name}
      </Text>
      
      {/* 第二行：当前价格 - 左对齐，32px字体，加粗，视觉核心 */}
      <Text 
        font={{ name: "system", size: 32 }}
        fontWeight="bold"
        lineLimit={1}
      >
        {formatNumber(displayStock.currentPrice)}
      </Text>
      
      {/* 第三行：涨跌价和涨跌幅 - 左对齐，14px字体 */}
      <HStack spacing={4} alignment="firstTextBaseline">
        <Text 
          foregroundStyle={changeColor}
          font={{ name: "system", size: 14 }}
          fontWeight="medium"
          lineLimit={1}
        >
          {displayStock.change >= 0 ? "+" : ""}{formatNumber(displayStock.change)}
        </Text>
        <Spacer />
        <Text 
          foregroundStyle={changeColor}
          font={{ name: "system", size: 14 }}
          fontWeight="medium"
          lineLimit={1}
        >
          {displayStock.changePercent >= 0 ? "+" : ""}{formatNumber(displayStock.changePercent)}%
        </Text>
      </HStack>
      
      {/* 第四行：更新时间 - 左对齐 */}
      <Text 
        opacity={0.6} 
        font={{ name: "system", size: 10 }}
        lineLimit={1}
      >
        {cacheTimestamp ? `${cacheTimestamp}` : "实时"}
      </Text>
    </VStack>
  )
}