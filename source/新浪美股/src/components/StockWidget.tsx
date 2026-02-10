import { Widget, Button, modifiers } from "scripting"
import { Stock } from "../types/stock"
import { AdaptiveStockWidget } from "./AdaptiveStockWidget"
import { RefreshStocksIntent } from "../app_intents"

interface StockWidgetProps {
  stocks: Stock[]
}

/**
 * 股票Widget主组件 - 使用自适应布局并支持交互刷新
 */
export function StockWidget({ stocks }: StockWidgetProps): JSX.Element {
  return (
    <Button
      intent={RefreshStocksIntent(undefined)}
      buttonStyle="plain"
      modifiers={modifiers()
        .frame({ maxWidth: "infinity", maxHeight: "infinity" })
      }
    >
      <AdaptiveStockWidget stocks={stocks} />
    </Button>
  )
}

/**
 * 显示股票Widget
 * @param stocks 股票数据数组
 */
export function presentStockWidget(stocks: Stock[]): void {
  Widget.present(<StockWidget stocks={stocks} />)
}