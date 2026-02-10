import { VStack, HStack, Text, Image, Spacer, Widget, Script } from "scripting"
import { fetchRSSData, formatTime } from "./utils/fetchRSS"
import { createUnifiedStorage } from "./storage/cache"

const storage = createUnifiedStorage("CLS_Telegraph")

// HTML 实体解码函数
function decodeHTMLEntities(text: string): string {
  const entityMap: { [key: string]: string } = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'",
    "&nbsp;": " "
  }

  return text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, (match: string) => {
    return entityMap[match] || match;
  })
}

// 过滤财联社电报名词前缀
function filterTelegraphPrefix(text: string): string {
  // 匹配「财联社x月x日电，」格式的前缀
  const telegraphPattern = /^财联社\S+月\S+日电，\s*/;
  return text.replace(telegraphPattern, "");
}

async function getNewsData(): Promise<{ items: any[]; fromCache: boolean }> {
  try {
    const news = await fetchRSSData()
    await storage.set("cache", { timestamp: Date.now(), items: news })
    return { items: news, fromCache: false }
  } catch (error: any) {
    console.error("Failed to fetch RSS data:", error)
    let cachedNews: any[] = []
    let fromCache = false
    try {
      const cache = await storage.get("cache")
      if (cache) {
        cachedNews = cache.items
        fromCache = true
      }
    } catch (cacheError: any) {
      console.error("Failed to get cache:", cacheError)
    }
    return { items: cachedNews, fromCache: fromCache }
  }
}

export default async function CLSTelegraphWidget() {
  console.log("📡 财联社电报 Widget 开始执行")

  const { items: news, fromCache } = await getNewsData()

  if (news.length === 0) {
    return Widget.present(
      <VStack alignment="center" padding={16} spacing={8}>
        <Text font={14}>⚠️ 无法获取新闻数据</Text>
        <Text font={12} opacity={0.6}>请检查网络或稍后再试</Text>
      </VStack>
    )
  }

  // 获取 Widget 系列（systemSmall, systemMedium, systemLarge）
  const widgetFamily = Widget.family

  // 小号组件：只显示最新一条完整新闻
  if (widgetFamily === "systemSmall") {
    const latestNews = news[0]
    const decodedTitle = decodeHTMLEntities(latestNews.title)
    const filteredTitle = filterTelegraphPrefix(decodedTitle)
    const newsTime = formatTime(latestNews.pubDate)


    const smallWidgetView = (
      <VStack
        alignment="leading"
        spacing={0}
        padding={{ horizontal: 10 }}
      >
        {/* 标题行 */}
        <HStack alignment="center" spacing={4} padding={{ top: 6 }} frame={{ height: 18 }}>
          <Image
            systemName="newspaper.fill"
            font={11}
            foregroundStyle="systemBlue"
          />
          <Text font={{ name: "system-bold", size: 12 }}>财联社电报</Text>
        </HStack>

        {/* 新闻内容 - 紧贴标题 */}
        <VStack alignment="leading" spacing={1} padding={{ bottom: 6 }} frame={{ height: 125 }}>
          <Text font={{ name: "system", size: 12 }} lineLimit={7}>
            {filteredTitle}
          </Text>
          <Text font={{ name: "system", size: 10 }} opacity={0.6}>
            {newsTime}
          </Text>
        </VStack>
      </VStack>
    )

    return Widget.present(smallWidgetView)
  }

  // 中号和大号组件：显示列表
  const itemCount = widgetFamily === "systemMedium" ? 5 : 10

  // 顶部标题栏
  const header = (
    <HStack alignment="center" spacing={8}>
      <Image
        systemName="newspaper.fill"
        font={14}
        foregroundStyle="systemBlue"
      />
      <Text font={{ name: "system-bold", size: 15 }}>财联社电报</Text>
      <Spacer />
      <Text font={10} opacity={0.6}>
        更新于 {formatTime(new Date().toISOString())}
        {fromCache ? "（缓存）" : ""}
      </Text>
    </HStack>
  )

  // 新闻列表布局（时间 + 标题）
  const items = news.slice(0, itemCount).map((item, i) => {
    // 先解码HTML实体，然后过滤掉财联社前缀
    const decodedTitle = decodeHTMLEntities(item.title);
    const filteredTitle = filterTelegraphPrefix(decodedTitle);

    return (
      <HStack key={i} spacing={6} alignment="top">
        <Text font={{ name: "system", size: 11 }} opacity={0.6} frame={{ width: 40 }}>
          {formatTime(item.pubDate)}
        </Text>
        <Text font={{ name: "system", size: 14 }} lineLimit={2}>
          {filteredTitle}
        </Text>
      </HStack>
    )
  })

  const widgetView = (
    <VStack
      padding={5}
      safeAreaPadding
    >
      {header}
      <VStack frame={{ height: 2 }} />
      <VStack spacing={3} alignment="leading">{items}</VStack>
    </VStack>
  )

  await Widget.present(widgetView)
}

CLSTelegraphWidget()
