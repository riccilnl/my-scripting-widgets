import {
  Navigation,
  NavigationStack,
  List,
  Section,
  Text,
  VStack,
  HStack,
  Spacer,
  Script,
  Button,
  useObservable,
  useEffect,
  useMemo,
  Group
} from "scripting"
import { NewsRepository, NewsItem } from "./utils/newsRepository"

// 全局 API 声明
declare const Animation: any
declare const UIGlass: any
declare const withAnimation: any
declare const Clipboard: {
  copyText(text: string): void
}
declare const HapticFeedback: {
  impact(options: { style: string }): void
  notification(options: { type: string }): void
}
declare function setTimeout(callback: () => void, ms: number): number

// 时间格式化函数
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "--:--";
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

// 复制文本到剪贴板的函数
async function copyToClipboard(text: string): Promise<void> {
  try {
    Clipboard.copyText(text)
    HapticFeedback.impact({ style: "light" })
    setTimeout(() => {
      HapticFeedback.impact({ style: "light" })
    }, 100)
    console.log("✅ 文本已复制到剪贴板")
  } catch (error) {
    console.error("❌ 复制到剪贴板失败:", error)
    HapticFeedback.notification({ type: "error" })
  }
}

// 优化后的新闻项组件
function NewsItemComponent({ news }: { news: NewsItem, key?: string }) {
  // 将内容和时间合并显示
  const displayContent = useMemo(() => {
    const baseContent = news.summary || news.title;
    return `${baseContent}（${formatTime(news.pubDate)}）`;
  }, [news.summary, news.title, news.pubDate]);

  const rawContent = news.summary || news.title;

  return (
    <VStack
      spacing={12}
      padding={12}
      contextMenu={{
        menuItems: (
          <Group>
            <Button
              title="复制原文"
              systemImage="doc.on.doc"
              action={() => copyToClipboard(rawContent)}
            />
          </Group>
        )
      }}
    >
      <Text
        font={{ name: "system", size: 16 }}
        lineSpacing={6}
        multilineTextAlignment="leading"
      >
        {displayContent}
      </Text>
    </VStack>
  )
}

// 新闻列表页面组件
export function NewsListPage() {
  const dismiss = Navigation.useDismiss()

  // 使用 useObservable 进行响应式状态管理
  const newsItems = useObservable<NewsItem[]>([])
  const loading = useObservable(true)
  const error = useObservable<string | null>(null)
  const isOffline = useObservable(false)

  // 初始加载逻辑
  const loadNews = async () => {
    try {
      loading.setValue(true)
      error.setValue(null)

      const newsResponse = await NewsRepository.getNewsData()

      // 使用动画进行状态切换
      await withAnimation(Animation.default(), () => {
        if (newsResponse.items.length > 0) {
          newsItems.setValue(newsResponse.items)
          isOffline.setValue(newsResponse.source === "cache")
        } else {
          error.setValue("暂无新闻数据")
        }
      })
    } catch (err) {
      error.setValue(err instanceof Error ? err.message : "未知错误")
    } finally {
      loading.setValue(false)
    }
  }

  // 组件挂载时加载，避免在 render body 中副作用引发死循环
  useEffect(() => {
    loadNews()
  }, [])

  const handleRefresh = async () => {
    try {
      const newsResponse = await NewsRepository.refreshNewsData()
      if (newsResponse.items.length > 0) {
        await withAnimation(Animation.spring(), () => {
          newsItems.setValue(newsResponse.items)
          isOffline.setValue(newsResponse.source === "cache")
        })
      }
    } catch (error) {
      console.error("❌ 刷新失败:", error)
    }
  }

  return (
    <NavigationStack>
      <VStack
        navigationTitle="财联社电报"
        navigationBarTitleDisplayMode="large"
        toolbar={{
          topBarTrailing: (
            <Button
              title="完成"
              action={dismiss as unknown as () => Promise<void>}
            />
          )
        }}
      >
        {/* 顶部外部间距 */}
        <VStack frame={{ height: 10 }} />

        <List
          refreshable={handleRefresh}
        >
          {/* 网络状态指示器 */}
          {isOffline.value ? (
            <Section>
              <VStack spacing={4} padding={8}>
                <HStack spacing={8} alignment="center">
                  <Text
                    font={{ name: "system", size: 11 }}
                    foregroundStyle="orange"
                  >
                    📱 离线模式 (显示缓存)
                  </Text>
                </HStack>
              </VStack>
            </Section>
          ) : null}

          {/* 加载与错误状态 */}
          {loading.value ? (
            <Section>
              <VStack alignment="center" padding={20}>
                <Text font={{ name: "system", size: 14 }} opacity={0.6}>加载中...</Text>
              </VStack>
            </Section>
          ) : null}

          {error.value && newsItems.value.length === 0 ? (
            <Section>
              <VStack alignment="center" padding={20} spacing={4}>
                <Text font={{ name: "system", size: 14 }} opacity={0.6}>获取新闻失败</Text>
                <Text font={{ name: "system", size: 12 }} opacity={0.4}>{error.value}</Text>
              </VStack>
            </Section>
          ) : null}

          {/* 新闻列表 */}
          <Section>
            {newsItems.value.map((news: NewsItem) => (
              <NewsItemComponent
                key={news.id}
                news={news}
              />
            ))}
          </Section>

          {/* 空数据状态 */}
          {!loading.value && newsItems.value.length === 0 && !error.value && (
            <Section>
              <VStack alignment="center" padding={20}>
                <Text font={{ name: "system", size: 14 }} opacity={0.6}>暂无新闻数据</Text>
              </VStack>
            </Section>
          )}
        </List>
      </VStack>
    </NavigationStack>
  )
}

// 主入口
async function main() {
  await Navigation.present({
    element: <NewsListPage />
  })
  Script.exit()
}

export default main