export const XHS_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

function decodeBasicEntities(input: string): string {
  return input
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/gi, "&")
    .replace(/&#x26;/gi, "&")
}

export function cleanSharedURL(raw: string): string {
  return decodeBasicEntities(raw)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/^[<({\[【《「『“‘]+/g, "")
    .replace(/[>)}\]】》」』”’.,!?;:，。！？；：、]+$/g, "")
}

export function isXiaohongshuURL(value: string): boolean {
  try {
    const host = new URL(cleanSharedURL(value)).hostname.toLowerCase()
    return (
      host === "xiaohongshu.com" ||
      host.endsWith(".xiaohongshu.com") ||
      host === "xhslink.cn" ||
      host.endsWith(".xhslink.cn") ||
      host === "xhslink.com" ||
      host.endsWith(".xhslink.com")
    )
  } catch {
    return false
  }
}

export function extractXiaohongshuURL(input: string): string | null {
  const text = decodeBasicEntities(input).replace(/[\u200B-\u200D\uFEFF]/g, "")
  const matches = text.match(/https?:\/\/[^\s<>"'“”‘’]+/gi) ?? []

  for (const raw of matches) {
    const url = cleanSharedURL(raw)
    if (isXiaohongshuURL(url)) return url
  }

  const direct = cleanSharedURL(text)
  return isXiaohongshuURL(direct) ? direct : null
}

function normalizeEscapes(text: string): string {
  return text
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\u003[aA]/g, ":")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/gi, "&")
    .replace(/&#x26;/gi, "&")
    .replace(/&quot;/gi, '"')
}

export function normalizeImageURL(raw: string): string | null {
  let value = normalizeEscapes(raw.trim()).replace(/[\\]+$/g, "")
  if (value.startsWith("//")) value = `https:${value}`
  if (value.startsWith("http://")) value = `https://${value.slice(7)}`

  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (!host.endsWith("xhscdn.com") && host !== "ci.xiaohongshu.com") return null
    return url.toString()
  } catch {
    return null
  }
}

function uniqueNormalized(urls: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of urls) {
    const url = normalizeImageURL(raw)
    if (!url || seen.has(url)) continue
    seen.add(url)
    result.push(url)
  }
  return result
}

export function extractShortcutPrimaryImageURLs(html: string): string[] {
  const source = normalizeEscapes(html)
  const urls: string[] = []
  const pattern = /content\s*=\s*["'](https?:\/\/sns-webpic-qc\.xhscdn\.com[^"']+)["']/gi

  for (const match of source.matchAll(pattern)) {
    if (match[1]) urls.push(match[1])
  }

  return uniqueNormalized(urls)
}

export function normalizePageImageURLs(urls: string[]): string[] {
  return uniqueNormalized(urls)
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter(value => {
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

export type PageImageMeta = {
  previewURL: string
  original?: string
  traceId?: string
  fileId?: string
}

function cleanAssetKey(raw: string): string {
  let value = normalizeEscapes(raw || "").trim()
  try { value = decodeURIComponent(value) } catch (_) {}
  value = value.replace(/^\/+/, "").split("?", 1)[0].split("!", 1)[0]
  return value
}

function originalURLsForKey(raw: string): string[] {
  if (!raw) return []

  const direct = normalizeImageURL(raw)
  if (direct) return [direct]

  const key = cleanAssetKey(raw)
  if (!key) return []

  return [
    `https://ci.xiaohongshu.com/${key}`,
    `https://sns-img-al.xhscdn.com/${key}`,
    `https://sns-img-bd.xhscdn.com/${key}`,
    `https://sns-img-qc.xhscdn.com/${key}`,
  ]
}

function originalKeyFromPreview(raw: string): string | null {
  const normalized = normalizeImageURL(raw)
  if (!normalized) return null

  const url = new URL(normalized)
  const path = cleanAssetKey(url.pathname)
  if (!path) return null

  // 2026+ routing prefixes must be preserved. The original endpoint accepts
  // notes_pre_post/... / notes_uhdr/... / spectrum/... directly.
  for (const marker of ["notes_pre_post/", "notes_uhdr/", "spectrum/"]) {
    const index = path.indexOf(marker)
    if (index >= 0) return path.slice(index)
  }

  // Older webpic URLs prepend timestamp/hash routing directories. The object
  // key is the final path component before the ! processing suffix.
  const parts = path.split("/").filter(Boolean)
  return parts.length ? parts[parts.length - 1] : null
}

/**
 * Build original/no-watermark candidates from the actual note image metadata.
 * Contract order: explicit `original` -> traceId -> fileId -> preview-derived
 * object key. This avoids guessing from urlDefault when the page already gives
 * us the stable image identity.
 */
export function buildOriginalImageCandidates(meta: PageImageMeta): string[] {
  const candidates: string[] = []

  if (meta.original) candidates.push(...originalURLsForKey(meta.original))
  if (meta.traceId) candidates.push(...originalURLsForKey(meta.traceId))
  if (meta.fileId) candidates.push(...originalURLsForKey(meta.fileId))

  const previewKey = originalKeyFromPreview(meta.previewURL)
  if (previewKey) candidates.push(...originalURLsForKey(previewKey))

  return dedupeStrings(candidates)
}

export type DetectedImageFormat = "jpg" | "png" | "webp" | "gif" | "heic" | "avif" | null

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return Array.from(bytes.slice(start, start + length)).map(v => String.fromCharCode(v)).join("")
}

export function detectImageFormat(bytes: Uint8Array | null, mimeType?: string): DetectedImageFormat {
  if (bytes && bytes.length >= 12) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg"
    if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return "png"
    if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp"
    if (ascii(bytes, 0, 3) === "GIF") return "gif"
    if (ascii(bytes, 4, 4) === "ftyp") {
      const brand = ascii(bytes, 8, 4).toLowerCase()
      if (["avif", "avis"].includes(brand)) return "avif"
      if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return "heic"
    }
  }

  const mime = (mimeType || "").toLowerCase().split(";", 1)[0].trim()
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg"
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/gif") return "gif"
  if (mime === "image/heic" || mime === "image/heif") return "heic"
  if (mime === "image/avif") return "avif"
  return null
}

export function buildPhotoFileName(index: number, extension: string, now = new Date()): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0")
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("")

  return `小红书-${stamp}-${pad(index + 1)}.${extension || "jpg"}`
}
