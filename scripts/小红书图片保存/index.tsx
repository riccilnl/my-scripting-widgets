import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  ProgressView,
  Script,
  Section,
  Spacer,
  Text,
  TextField,
  VStack,
  useState,
} from "scripting"
import {
  XHS_USER_AGENT,
  buildOriginalImageCandidates,
  buildPhotoFileName,
  detectImageFormat,
  extractShortcutPrimaryImageURLs,
  extractXiaohongshuURL,
  normalizePageImageURLs,
  type PageImageMeta,
} from "./core"

type LoadState = "idle" | "loading" | "ready" | "error"

type LoadResult = {
  pageURL: string
  imageURLs: string[]
  source: "shortcut-html" | "note-state" | "note-dom"
  imageMeta: Record<string, PageImageMeta>
}

type PageExtraction = {
  pageURL?: string
  stateItems?: Array<{ previewURL?: string; original?: string; traceId?: string; fileId?: string }>
  domURLs?: string[]
}

const PAGE_EXTRACTOR = String.raw`
return (() => {
  const result = { pageURL: location.href, stateItems: [], domURLs: [] };
  const seenState = new Set();
  const seenDom = new Set();

  const validURL = (value) => {
    if (typeof value !== 'string') return '';
    const url = value.trim();
    if (!/^https?:\/\//i.test(url) && !url.startsWith('//')) return '';
    if (!url.includes('xhscdn.com') && !url.includes('ci.xiaohongshu.com')) return '';
    return url;
  };

  try {
    const st = window.__INITIAL_STATE__;
    let note = null;
    if (st) {
      note = st?.noteData?.data?.noteData || null;
      const noteIdMatch = location.pathname.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/);
      const noteId = noteIdMatch ? noteIdMatch[1] : '';
      const map = st?.note?.noteDetailMap;
      if (!note && map && typeof map === 'object') {
        if (noteId && map[noteId]?.note) note = map[noteId].note;
        if (!note) {
          const values = Object.values(map);
          const exact = values.find(v => v?.note?.noteId === noteId || v?.note?.id === noteId);
          note = exact?.note || values.find(v => Array.isArray(v?.note?.imageList))?.note || null;
        }
      }
      if (!note && Array.isArray(st?.note?.data?.imageList)) note = st.note.data;
    }

    const list = Array.isArray(note?.imageList) ? note.imageList : [];
    for (const item of list) {
      const previewURL = validURL(item?.urlDefault || item?.url || item?.urlPre || item?.urlPreLarge || item?.infoList?.[0]?.url);
      if (!previewURL || seenState.has(previewURL)) continue;
      seenState.add(previewURL);
      result.stateItems.push({
        previewURL,
        original: typeof item?.original === 'string' ? item.original : '',
        traceId: typeof item?.traceId === 'string' ? item.traceId : '',
        fileId: typeof item?.fileId === 'string' ? item.fileId : ''
      });
    }
  } catch (_) {}

  try {
    const selectors = [
      '.swiper-wrapper .swiper-slide:not(.swiper-slide-duplicate) img[data-xhs-img]',
      '.swiper-wrapper .swiper-slide:not(.swiper-slide-duplicate) img',
      '.note-slider-img img[data-xhs-img]',
      'img.note-slider-img[data-xhs-img]',
      '.media-container img[data-xhs-img]'
    ];
    for (const selector of selectors) {
      for (const img of document.querySelectorAll(selector)) {
        const src = validURL(img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src'));
        if (!src || seenDom.has(src)) continue;
        seenDom.add(src);
        result.domURLs.push(src);
      }
      if (result.domURLs.length > 0) break;
    }
  } catch (_) {}

  return result;
})()
`

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function extractFromLoadedPage(webView: WebViewController): Promise<LoadResult | null> {
  const html = await webView.getHTML()
  const pageData = await webView.evaluateJavaScript<PageExtraction>(PAGE_EXTRACTOR)
  const pageURL = pageData?.pageURL || ""

  if (html) {
    const shortcutURLs = extractShortcutPrimaryImageURLs(html)
    if (shortcutURLs.length > 0) {
      const imageMeta: Record<string, PageImageMeta> = {}
      for (const url of shortcutURLs) imageMeta[url] = { previewURL: url, original: url }
      return { pageURL, imageURLs: shortcutURLs, source: "shortcut-html", imageMeta }
    }
  }

  const stateItems = pageData?.stateItems ?? []
  const stateURLs = normalizePageImageURLs(stateItems.map(item => item.previewURL || ""))
  if (stateURLs.length > 0) {
    const imageMeta: Record<string, PageImageMeta> = {}
    for (const item of stateItems) {
      if (!item.previewURL) continue
      const normalized = normalizePageImageURLs([item.previewURL])[0]
      if (!normalized) continue
      imageMeta[normalized] = {
        previewURL: normalized,
        original: item.original || undefined,
        traceId: item.traceId || undefined,
        fileId: item.fileId || undefined,
      }
    }
    return { pageURL, imageURLs: stateURLs, source: "note-state", imageMeta }
  }

  const domURLs = normalizePageImageURLs(pageData?.domURLs ?? [])
  if (domURLs.length > 0) {
    const imageMeta: Record<string, PageImageMeta> = {}
    for (const url of domURLs) imageMeta[url] = { previewURL: url }
    return { pageURL, imageURLs: domURLs, source: "note-dom", imageMeta }
  }

  return null
}

async function extractFromWebView(webView: WebViewController): Promise<LoadResult | null> {
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const result = await extractFromLoadedPage(webView)
      if (result && result.imageURLs.length > 0) return result
    } catch (error) {
      console.warn("页面数据尚未就绪", error)
    }
    if (attempt < 14) await wait(300)
  }
  return null
}

async function loadImages(inputURL: string): Promise<LoadResult> {
  // First use native fetch to follow xhslink.cn redirects. Response.url is the
  // final Xiaohongshu note URL, which avoids asking WebView to navigate the
  // universal/deep-link short URL directly.
  let fetchedHTML = ""
  let finalURL = inputURL

  try {
    const response = await fetch(inputURL, {
      timeout: 30,
      headers: {
        "User-Agent": XHS_USER_AGENT,
        "Accept-Language": "zh-CN,zh-Hans;q=0.9,en;q=0.7",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      debugLabel: "XHS Resolve",
    })

    if (response.ok) {
      finalURL = response.url || inputURL
      fetchedHTML = await response.text()

      // The original Shortcut can sometimes be reproduced directly from the
      // HTML returned by the native request; use it before involving WebView.
      const shortcutURLs = extractShortcutPrimaryImageURLs(fetchedHTML)
      if (shortcutURLs.length > 0) {
        return { pageURL: finalURL, imageURLs: shortcutURLs, source: "shortcut-html", imageMeta: Object.fromEntries(shortcutURLs.map(url => [url, { previewURL: url, original: url }])) }
      }
    } else {
      console.warn(`短链解析 HTTP ${response.status}`)
    }
  } catch (error) {
    console.warn("短链预解析失败，继续尝试网页加载", error)
  }

  // Use persistent WebView storage. Xiaohongshu is less reliable in an
  // ephemeral WebKit data store, especially across redirect/challenge hops.
  const webView = new WebViewController()

  try {
    let loaded = false

    // Prefer the already-resolved note URL. Retry once because WKWebView can
    // transiently fail its first navigation while network state is changing.
    for (let attempt = 0; attempt < 2 && !loaded; attempt++) {
      try {
        loaded = await webView.loadURL(finalURL)
        if (loaded) {
          await webView.waitForLoad()
          const result = await extractFromWebView(webView)
          if (result) return { ...result, pageURL: result.pageURL || finalURL }
        }
      } catch (error) {
        console.warn("WebView 页面加载失败", error)
      }
      if (!loaded && attempt === 0) await wait(500)
    }

    // Final fallback: if native fetch obtained HTML successfully, render that
    // HTML in WebKit with the final URL as its base. Inline __INITIAL_STATE__
    // can then be read without another top-level Xiaohongshu navigation.
    if (fetchedHTML) {
      const htmlLoaded = await webView.loadHTML(fetchedHTML, finalURL)
      if (htmlLoaded) {
        await webView.waitForLoad()

        const shortcutURLs = extractShortcutPrimaryImageURLs((await webView.getHTML()) || fetchedHTML)
        if (shortcutURLs.length > 0) {
          return { pageURL: finalURL, imageURLs: shortcutURLs, source: "shortcut-html", imageMeta: Object.fromEntries(shortcutURLs.map(url => [url, { previewURL: url, original: url }])) }
        }

        const result = await extractFromWebView(webView)
        if (result) return { ...result, pageURL: result.pageURL || finalURL }
      }
    }

    if (!loaded && !fetchedHTML) {
      throw new Error("小红书页面加载失败：短链和正文页都无法打开")
    }
    throw new Error("页面已打开，但没有识别到这篇笔记的正文图片")
  } finally {
    webView.dispose()
  }
}

async function saveOnePhoto(
  previewURL: string,
  meta: PageImageMeta,
  pageURL: string,
  index: number,
  source: LoadResult["source"],
): Promise<void> {
  const derived = buildOriginalImageCandidates(meta)
  // The original Shortcut downloads its matched content= URL as-is. Preserve
  // that proven path. State/DOM paths use metadata-derived originals only.
  const candidates = source === "shortcut-html"
    ? [previewURL, ...derived.filter(url => url !== previewURL)]
    : derived

  if (candidates.length === 0) {
    throw new Error(`图片 ${index + 1} 没有可用的原图地址`)
  }

  let lastError = "原图地址不可用"

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        timeout: 60,
        headers: {
          "User-Agent": XHS_USER_AGENT,
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      })

      if (!response.ok) {
        lastError = `${new URL(url).hostname} HTTP ${response.status}`
        continue
      }

      const data = await response.data()
      const bytes = data.toUint8Array()
      const format = detectImageFormat(bytes, response.mimeType)
      if (!format) {
        lastError = `${new URL(url).hostname} 返回的不是可识别图片 (${response.mimeType || "unknown"})`
        continue
      }

      // Original XHS CDNs often return application/octet-stream even for valid
      // image bytes. Trust file signatures, not MIME alone.
      const fileName = buildPhotoFileName(index, format)
      let saved = await Photos.savePhoto(data, { fileName })

      // If Photos rejects a WebP/HEIC/octet-stream container, let UIImage
      // decode it and re-encode losslessly-enough as JPEG for the camera roll.
      if (!saved) {
        const image = UIImage.fromData(data)
        const jpeg = image?.toJPEGData(1) || null
        if (jpeg) {
          saved = await Photos.savePhoto(jpeg, { fileName: buildPhotoFileName(index, "jpg") })
        }
      }

      if (!saved) {
        lastError = `${new URL(url).hostname} 下载成功但系统相册拒绝写入 (${format})`
        continue
      }
      return
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  throw new Error(`图片 ${index + 1} 原图下载失败：${lastError}`)
}

function App() {
  const dismiss = Navigation.useDismiss()
  const [input, setInput] = useState("")
  const [state, setState] = useState<LoadState>("idle")
  const [message, setMessage] = useState("粘贴小红书分享文本或笔记地址，然后点解析。")
  const [pageURL, setPageURL] = useState("")
  const [loadSource, setLoadSource] = useState<LoadResult["source"]>("note-state")
  const [imageURLs, setImageURLs] = useState<string[]>([])
  const [imageMeta, setImageMeta] = useState<Record<string, PageImageMeta>>({})
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleParse = async () => {
    if (saving || state === "loading") return

    const url = extractXiaohongshuURL(input)
    if (!url) {
      setState("error")
      setMessage("没有找到有效的小红书链接。")
      return
    }

    setState("loading")
    setMessage("正在通过网页加载笔记正文…")
    setPageURL("")
    setLoadSource("note-state")
    setImageURLs([])
    setImageMeta({})
    setSelected([])

    try {
      const result = await loadImages(url)
      setPageURL(result.pageURL || url)
      setLoadSource(result.source)
      setImageURLs(result.imageURLs)
      setImageMeta(result.imageMeta)
      setSelected([])
      setState("ready")
      setMessage(`找到 ${result.imageURLs.length} 张正文图片；保存时将下载无水印原图`)
    } catch (error) {
      setState("error")
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const toggle = (url: string) => {
    if (saving) return
    setSelected(current => current.includes(url) ? current.filter(item => item !== url) : [...current, url])
  }

  const toggleAll = () => {
    if (saving) return
    setSelected(selected.length === imageURLs.length ? [] : [...imageURLs])
  }

  const handleSave = async () => {
    if (saving || selected.length === 0) return

    setSaving(true)
    setProgress(0)
    const failed: string[] = []
    const failedDetails: string[] = []
    let successCount = 0

    for (let i = 0; i < selected.length; i++) {
      const url = selected[i]
      try {
        const originalIndex = imageURLs.indexOf(url)
        await saveOnePhoto(url, imageMeta[url] || { previewURL: url }, pageURL, originalIndex >= 0 ? originalIndex : i, loadSource)
        successCount += 1
      } catch (error) {
        failed.push(url)
        const detail = error instanceof Error ? error.message : String(error)
        failedDetails.push(detail)
        console.error(error)
      }
      setProgress(i + 1)
    }

    setSaving(false)

    if (failed.length === 0) {
      setSelected([])
      setMessage(`已保存 ${successCount} 张照片到系统相册。`)
      await Dialog.alert({ title: "保存完成", message: `已保存 ${successCount} 张照片到系统相册。` })
      return
    }

    setSelected(failed)
    const firstError = failedDetails[0] || "未知错误"
    setMessage(`已保存 ${successCount} 张，${failed.length} 张失败：${firstError}`)
    await Dialog.alert({ title: "部分图片保存失败", message: `成功 ${successCount} 张，失败 ${failed.length} 张。\n\n${firstError}` })
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="小红书图片保存"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="完成" disabled={saving} action={dismiss} />,
          confirmationAction: state === "ready" ? (
            <Button
              title={saving ? `保存 ${progress}/${selected.length}` : "保存"}
              disabled={saving || selected.length === 0}
              action={handleSave}
            />
          ) : undefined,
        }}
      >
        <Section title="小红书地址">
          <TextField title="粘贴分享文本或链接" value={input} onChanged={setInput} />
          <Button
            title={state === "loading" ? "解析中…" : "解析图片"}
            disabled={saving || state === "loading" || input.trim().length === 0}
            action={handleParse}
          />
        </Section>

        <Section>
          {state === "loading" ? (
            <HStack spacing={10}>
              <ProgressView progressViewStyle="circular" />
              <Text>{message}</Text>
            </HStack>
          ) : (
            <Text foregroundStyle={state === "error" ? "systemRed" : "secondaryLabel"}>{message}</Text>
          )}
        </Section>

        {state === "ready" ? (
          <>
            <Section>
              <HStack>
                <Text>{saving ? `正在保存 ${progress}/${selected.length}` : `已选 ${selected.length} / ${imageURLs.length} 张`}</Text>
                <Spacer />
                <Button title={selected.length === imageURLs.length ? "取消全选" : "全选"} disabled={saving} action={toggleAll} />
              </HStack>
              {saving ? <ProgressView value={progress / Math.max(selected.length, 1)} /> : null}
            </Section>

            <Section title="正文图片">
              {imageURLs.map((url, index) => {
                const checked = selected.includes(url)
                return (
                  <Button key={url} buttonStyle="plain" disabled={saving} action={() => toggle(url)}>
                    <HStack spacing={12}>
                      <Image imageUrl={url} resizable scaleToFill frame={{ width: 92, height: 92 }} clipShape={{ type: "rect", cornerRadius: 10 }} />
                      <VStack alignment="leading" spacing={4}>
                        <Text font="headline">第 {index + 1} 张</Text>
                        <Text font="caption" foregroundStyle="secondaryLabel">点按{checked ? "取消选择" : "选择"}</Text>
                      </VStack>
                      <Spacer />
                      <Image systemName={checked ? "checkmark.circle.fill" : "circle"} foregroundStyle={checked ? "systemBlue" : "secondaryLabel"} font="title2" />
                    </HStack>
                  </Button>
                )
              })}
            </Section>
          </>
        ) : null}
      </List>
    </NavigationStack>
  )
}

async function run() {
  await Navigation.present({ element: <App /> })
  Script.exit()
}

run()
