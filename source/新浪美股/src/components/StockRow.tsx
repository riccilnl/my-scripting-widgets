import { HStack, Text, VStack, Image, Spacer, modifiers } from "scripting"
import { Stock } from "../types/stock"
import { formatPrice, formatPercent } from "../utils/number"

interface StockRowProps {
  stock: Stock
  size?: "small" | "medium" | "large"
  compact?: boolean
}

/**
 * 高级质感股票行组件 - 单列富信息版
 */
export function StockRow({ stock, size = "medium", compact = false }: StockRowProps): JSX.Element {
  const isUp = stock.change >= 0;

  // 美股传统的红涨绿跌
  const mainColor = isUp ? "#FF3B30" : "#34C759";
  // 渐变背景：从左(透明度0)到右(透明度0.2)
  const gradientBg = isUp 
    ? ["rgba(255, 59, 48, 0)", "rgba(255, 59, 48, 0.2)"]
    : ["rgba(52, 199, 89, 0)", "rgba(52, 199, 89, 0.2)"];

  // 响应式尺寸计算 (再次调小字号)
  let fontSize = size === "small" ? 9 : (size === "large" ? 12 : 10);
  if (compact) fontSize = 9; // 紧凑模式强制小字号

  // 计算价格在当日幅度的位置 (0-1)
  let pricePosition = 0;
  if (stock.high && stock.low && stock.high > stock.low) {
    pricePosition = (stock.currentPrice - stock.low) / (stock.high - stock.low);
    pricePosition = Math.max(0, Math.min(1, pricePosition)); // 限制在 0-1 之间
  }

  const verticalPadding = compact ? 2 : 8;

  return (
    <HStack
      spacing={10}
      alignment="center"
      padding={{ leading: 10, trailing: 10, top: verticalPadding, bottom: verticalPadding }}
      modifiers={modifiers()
        .background({
          type: "linearGradient",
          colors: gradientBg,
          startPoint: { x: 0.3, y: 0.5 },
          endPoint: { x: 1, y: 0.5 }
        } as any)
      }
    >
      {/* 左侧：代码与名称 */}
      <VStack alignment="leading" spacing={1} modifiers={modifiers().frame({ width: 55, alignment: "leading" as any })}>
        <Text
          fontWeight="bold"
          font={{ name: "system", size: fontSize }}
          foregroundStyle={"primaryLabel" as any}
          lineLimit={1}
        >
          {stock.symbol.toUpperCase()}
        </Text>
        <Text
          font={{ name: "system", size: fontSize - 3 }}
          foregroundStyle="secondaryLabel"
          lineLimit={1}
          opacity={0.8}
        >
          {stock.name}
        </Text>
      </VStack>

      {/* 中间：当日价格区间条 (Day Range Bar) */}
      <Spacer />
      {(stock.high && stock.low) ? (
        <VStack spacing={2} alignment="leading" modifiers={modifiers().frame({ maxWidth: 80 })}>
          <HStack spacing={0}>
            <Text font={{ name: "system", size: 8 }} opacity={0.5} foregroundStyle="secondaryLabel">{formatPrice(stock.low)}</Text>
            <Spacer />
            <Text font={{ name: "system", size: 8 }} opacity={0.5} foregroundStyle="secondaryLabel">{formatPrice(stock.high)}</Text>
          </HStack>

          {/* 进度条背景 - 使用简单的 背景色修饰 */}
          <HStack
            spacing={0}
            modifiers={modifiers()
              .frame({ height: 3 })
              .background("tertiaryLabel" as any)
              .clipShape("capsule")
            }
          >
            <Spacer minLength={0} />
            <HStack modifiers={modifiers().frame({ width: `${Math.max(0, Math.min(100, pricePosition * 100))}%` as any })} />
            {/* 游标 */}
            <HStack modifiers={modifiers().frame({ width: 4, height: 3 }).background(mainColor as any).clipShape("capsule")} />
            <Spacer />
          </HStack>
        </VStack>
      ) : null}
      <Spacer />

      {/* 右侧：价格与涨跌 */}
      <VStack alignment="trailing" spacing={0}>
        <Text
          fontWeight="bold"
          font={{ name: "system", size: fontSize + 1 }}
          foregroundStyle={"primaryLabel" as any}
        >
          {formatPrice(stock.currentPrice)}
        </Text>
        <HStack spacing={2} alignment="center">
          <Image
            systemName={isUp ? "arrow.up" : "arrow.down"}
            font={8}
            foregroundStyle={mainColor as any}
          />
          <Text
            font={{ name: "system", size: fontSize - 2 }}
            foregroundStyle={mainColor as any}
            fontWeight="bold"
          >
            {formatPercent(stock.changePercent)}
          </Text>
        </HStack>
      </VStack>
    </HStack>
  )
}