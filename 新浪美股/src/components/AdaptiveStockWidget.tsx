import { Widget } from "scripting"
import { Stock } from "../types/stock"
import { SmallStockWidget } from "./SmallStockWidget"
import { MediumStockWidget } from "./MediumStockWidget"
import { LargeStockWidget } from "./LargeStockWidget"

interface AdaptiveStockWidgetProps {
  stocks: Stock[]
}

/**
 * 自适应股票Widget组件 - 根据小组件尺寸选择合适的布局
 */
export function AdaptiveStockWidget({ stocks }: AdaptiveStockWidgetProps): JSX.Element {
  const widgetFamily = Widget.family

  switch (widgetFamily) {
    case "systemSmall":
      return <SmallStockWidget stocks={stocks} />
    case "systemMedium":
      return <MediumStockWidget stocks={stocks} />
    case "systemLarge":
    case "systemExtraLarge":
      return <LargeStockWidget stocks={stocks} />
    default:
      // 默认使用中号布局
      return <MediumStockWidget stocks={stocks} />
  }
}