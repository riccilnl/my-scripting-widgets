import { useState } from "scripting"
import { 
  Navigation, 
  NavigationStack, 
  List, 
  Button, 
  Text, 
  TextField, 
  Section, 
  HStack, 
  VStack,
  Spacer
} from "scripting"
import { StockConfigManager } from "../core/StockConfigManager"

/**
 * 股票设置页面组件
 */
export function StockSettingsPage() {
  const [stockConfigs, setStockConfigs] = useState(StockConfigManager.getUserStockConfigs())
  const [newSymbol, setNewSymbol] = useState("")
  const [message, setMessage] = useState<{ type: 'success' | 'error' | null; text: string }>({ type: null, text: '' })
  const dismiss = Navigation.useDismiss()

  /**
   * 显示消息
   */
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    // 3秒后自动清除消息
    setTimeout(() => {
      setMessage({ type: null, text: '' })
    }, 3000)
  }

  /**
   * 刷新股票配置列表
   */
  const refreshStockConfigs = () => {
    setStockConfigs(StockConfigManager.getUserStockConfigs())
  }

  /**
   * 添加股票代码
   */
  const handleAddStock = () => {
    if (!newSymbol.trim()) {
      showMessage('error', '请输入股票代码')
      return
    }

    const result = StockConfigManager.addStockSymbol(newSymbol)
    showMessage(result.success ? 'success' : 'error', result.message)
    
    if (result.success) {
      setNewSymbol("")
      refreshStockConfigs()
    }
  }

  /**
   * 删除股票代码
   */
  const handleRemoveStock = (symbol: string) => {
    const result = StockConfigManager.removeStockSymbol(symbol)
    showMessage(result.success ? 'success' : 'error', result.message)
    
    if (result.success) {
      refreshStockConfigs()
    }
  }

  /**
   * 重置为默认配置
   */
  const handleResetToDefault = () => {
    const result = StockConfigManager.resetToDefault()
    showMessage(result.success ? 'success' : 'error', result.message)
    
    if (result.success) {
      refreshStockConfigs()
    }
  }

  /**
   * 验证输入的股票代码
   */
  const isValidInput = (symbol: string): boolean => {
    return StockConfigManager.isValidStockSymbol(symbol)
  }

  const configStats = StockConfigManager.getConfigStats()

  return (
    <NavigationStack>
      <List
        navigationTitle="股票设置"
        toolbar={{
          cancellationAction: <Button title="完成" action={dismiss} />,
        }}
      >
        {/* 消息提示 */}
        {message.type && (
          <Section>
            <VStack spacing={4} padding={8}>
              <Text 
                foregroundStyle={message.type === 'success' ? 'systemGreen' : 'systemRed'}
                font={{ name: "system", size: 14 }}
              >
                {message.text}
              </Text>
            </VStack>
          </Section>
        )}

        {/* 添加新股票代码 */}
        <Section title="添加股票代码">
          <VStack spacing={8}>
            <TextField
              title="股票代码"
              value={newSymbol}
              onChanged={setNewSymbol}
              prompt="输入美股代码，如 AAPL"
            />
            <Spacer />
            <Button 
              title="添加股票" 
              action={handleAddStock}
            />
            {(!isValidInput(newSymbol) && newSymbol.trim()) ? (
              <Text font="caption" foregroundStyle="red">
                股票代码格式无效，请输入1-5个英文字母
              </Text>
            ) : null}
          </VStack>
        </Section>

        {/* 当前股票列表 */}
        <Section title={`当前股票列表 (${configStats.totalCount}/${configStats.maxCount})`}>
          {stockConfigs.length === 0 ? (
            <Text foregroundStyle="secondaryLabel">暂无股票代码</Text>
          ) : (
            stockConfigs.map((config) => (
              <HStack key={config.symbol} spacing={12}>
                <Text fontWeight="medium">{config.symbol.toUpperCase()}</Text>
                <Spacer />
                <Button 
                  title="删除" 
                  action={() => handleRemoveStock(config.symbol)}
                  buttonStyle="bordered"
                />
              </HStack>
            ))
          )}
        </Section>

        {/* 操作按钮 */}
        <Section title="操作">
          <VStack spacing={8} alignment="leading">
            <Button 
              title="重置为默认配置" 
              action={handleResetToDefault}
              buttonStyle="bordered"
            />
            {configStats.isDefault ? (
              <Text font="caption" foregroundStyle="tertiaryLabel">
                当前已是默认配置
              </Text>
            ) : null}
            <Spacer />
            <Text>
              当前共有 {configStats.totalCount} 个股票代码
              {configStats.totalCount === 0 && "，请添加股票代码"}
            </Text>
          </VStack>
        </Section>

        {/* 使用说明 */}
        <Section title="使用说明">
          <VStack spacing={4} alignment="leading">
            <Text>• 股票代码应为1-5个英文字母</Text>
            <Text>• 代码会自动转换为大写</Text>
            <Text>• 最多可添加{configStats.maxCount}个股票代码</Text>
            <Text>• 删除后需要重新添加才能显示</Text>
            <Text>• 数据来源于新浪财经</Text>
          </VStack>
        </Section>

        {/* 默认股票代码参考 */}
        <Section title="默认股票代码">
          <VStack spacing={2} alignment="leading">
            <Text font="caption" foregroundStyle="secondaryLabel">
              MSFT - 微软 | AAPL - 苹果 | AMZN - 亚马逊
            </Text>
            <Text font="caption" foregroundStyle="secondaryLabel">
              GOOG - 谷歌 | TSLA - 特斯拉
            </Text>
          </VStack>
        </Section>
      </List>
    </NavigationStack>
  )
}