/**
 * 拉取并解析财联社电报 RSS（pyrsshub 源）
 */
export async function fetchRSSData(): Promise<
  { title: string; pubDate: string; content: string }[]
> {
  const url = "https://pyrsshub.vercel.app/cls/telegraph/";
  try {
    const resp = await (globalThis as any).fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)",
        Accept: "application/rss+xml, text/xml, */*;q=0.8",
      },
    });

    const text = await resp.text();

    const items: { title: string; pubDate: string; content: string }[] = [];
    // 预编译更灵活的正则以支持带有属性的标签（如 <entry xmlns="..."> 或 <title type="text">）
    const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/g;
    const titleRegex = /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
    const contentRegex = /<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i;
    const dateRegex = /<(?:published|pubDate)[^>]*>([\s\S]*?)<\/(?:published|pubDate)>/i;

    let match: RegExpExecArray | null;

    while ((match = entryRegex.exec(text)) !== null) {
      const entry = match[1];
      const title = entry.match(titleRegex)?.[1]?.trim() ?? "";
      const content = entry.match(contentRegex)?.[1]?.trim() ?? "";
      const pubDate = entry.match(dateRegex)?.[1]?.trim() ?? "";

      if (title || content) {
        items.push({ title, content, pubDate });
      }
    }

    if (items.length === 0) throw new Error("RSS 解析失败");
    return items.slice(0, 40);
  } catch (e) {
    console.error("fetchRSSData 失败：", e);
    throw e;
  }
}

/** 将时间字符串格式化为 HH:MM */
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "--:--";
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/** HTML 实体解码函数（单次正则替换优化） */
export function decodeHTMLEntities(text: string): string {
  const entityMap: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'",
    "&nbsp;": " "
  }

  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (match) => entityMap[match] || match);
}

/** 过滤财联社电报名词前缀 */
export function filterTelegraphPrefix(text: string): string {
  const telegraphPattern = /^财联社\S+月\S+日电，\s*/;
  return text.replace(telegraphPattern, "");
}