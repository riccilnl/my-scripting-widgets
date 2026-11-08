import { fetch } from "scripting"
import { Song, titleOf } from "./api"
import { ScoreProbe } from "./score"

// No endpoint or credential is published in the GitHub script.
// The URL uses script-private Storage; only the song-scoped token uses Keychain.
const URL_KEY = "kuaiyuepu.mysheet.url"
const TOKEN_KEY = "kuaiyuepu.mysheet.song-api-token"

export function readMySheetSettings(): { url: string; hasToken: boolean } {
  return {
    url: String(Storage.get<string>(URL_KEY) || ""),
    hasToken: Boolean(Keychain.get(TOKEN_KEY)),
  }
}

export function validateMySheetURL(value: string): string {
  const raw = value.trim()
  if (!raw) throw new Error("请先填写 MySheet 地址")
  let url: URL
  try { url = new URL(raw) } catch { throw new Error("MySheet 地址不是有效 URL") }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("MySheet 地址只能包含协议、域名和可选端口")
  }
  if (url.protocol === "https:") return url.origin
  if (url.protocol === "http:" && (
    url.hostname === "localhost" || url.hostname === "127.0.0.1" ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url.hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(url.hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(url.hostname)
  )) return url.origin
  throw new Error("云端 MySheet 必须使用 HTTPS；HTTP 仅限本地私有地址")
}

export function saveMySheetSettings(address: string, newToken: string): void {
  const url = validateMySheetURL(address)
  const token = newToken.trim()
  // Never transmit any Bearer token to plaintext HTTP, including LAN HTTP.
  if (url.startsWith("http:") && (token || Keychain.get(TOKEN_KEY))) {
    throw new Error("HTTP 连接不可使用 API Token；请使用 HTTPS")
  }
  if (token && token.length < 32) throw new Error("曲谱 API Token 长度不足 32 字符")
  if (token && !Keychain.set(TOKEN_KEY, token, {
    accessibility: "unlocked_this_device", synchronizable: false,
  })) throw new Error("无法把 Token 写入 iPhone 钥匙串")
  if (!Storage.set(URL_KEY, url)) throw new Error("MySheet 地址保存失败")
}

export function clearMySheetToken(): void {
  if (!Keychain.remove(TOKEN_KEY)) throw new Error("删除 Token 失败")
}

function mySheetConnection(): { url: string; headers: Record<string, string> } {
  const url = validateMySheetURL(readMySheetSettings().url)
  const token = Keychain.get(TOKEN_KEY) || ""
  if (url.startsWith("http:") && token) throw new Error("禁止通过 HTTP 发送 API Token")
  return { url, headers: token ? { Authorization: "Bearer " + token } : {} }
}

type SongRecord = { id: number; title: string; content_json: string }
type LibraryItem = { id: number; title: string }
type SaveResult = { id: number; alreadyExists: boolean }

// Cloud gateways sometimes return an HTML login/error page with HTTP 200.
// Detect that explicitly rather than leaking an unhelpful JSON Parse error.
function describeHTTPResult(response: any, raw: string): Error | null {
  const status = Number(response.status) || 0
  const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase()
  const html = /(?:^\s*<!doctype\s+html|^\s*<html|^\s*<)/i.test(raw) || contentType.includes("text/html")
  if (html) {
    const redirected = typeof response.redirected === "boolean" && response.redirected
      ? "；已发生重定向" : ""
    return new Error("MySheet API 返回 HTML（HTTP " + status + redirected +
      "），不是曲谱 JSON。请检查云端 HTTPS 地址、Cloady 入口或额外的网页访问验证。")
  }
  return null
}

async function readJson<T>(url: string, options?: Record<string, unknown>): Promise<T> {
  const connection = mySheetConnection()
  if (!url.startsWith(connection.url + "/api/songs")) {
    throw new Error("MySheet 请求路径不符合限定的曲谱 API")
  }
  const requestedHeaders = (options?.headers || {}) as Record<string, string>
  let response: any
  try {
    response = await fetch(url, {
      timeout: 20, ...options,
      headers: { Accept: "application/json", ...requestedHeaders, ...connection.headers },
    })
  } catch {
    // Never include request options or credentials in errors/logs.
    throw new Error("无法连接 MySheet，请检查 HTTPS 地址及网络")
  }
  // One body read on both success and failure. Never display raw HTML.
  let raw: string
  try { raw = await response.text() }
  catch { throw new Error("MySheet HTTP " + response.status + "：无法读取服务器响应") }
  const htmlProblem = describeHTTPResult(response, raw)
  if (htmlProblem) throw htmlProblem
  let data: any
  try { data = JSON.parse(raw) }
  catch { throw new Error("MySheet HTTP " + response.status +
    "：服务端没有返回有效 JSON，请核对 HTTPS 地址是否指向 MySheet") }
  if (!response.ok) {
    const detail = typeof data?.error === "string" ? data.error.slice(0, 120) : ""
    if (response.status === 401) {
      throw new Error("MySheet HTTP 401：曲谱 API Token 未设置、错误或已失效；请使用 MYSHEET_API_TOKEN")
    }
    if (response.status === 403) {
      throw new Error("MySheet HTTP 403：访问被拒绝，请确认使用曲谱 Token 而非管理员 Token")
    }
    throw new Error("MySheet HTTP " + response.status + (detail ? "：" + detail : ""))
  }
  return data as T
}

// Read-only check, using the identical authenticated request path as saving.
export async function testMySheetConnection(): Promise<number> {
  const baseURL = mySheetConnection().url
  const songs = await readJson<LibraryItem[]>(baseURL + "/api/songs")
  if (!Array.isArray(songs)) throw new Error("MySheet /api/songs 未返回曲谱数组，请检查服务地址")
  return songs.length
}

function verifiedRecord(record: SongRecord, uuid: string, dsl: string): boolean {
  const saved = JSON.parse(record.content_json)
  return saved?.source?.provider === "kuaiyuepu" &&
    saved.source.uuid === uuid && saved.source.native_dsl === dsl
}

export async function saveToMySheet(song: Song, probe: ScoreProbe): Promise<SaveResult> {
  const uuid = String(song.song_uuid || "")
  const dsl = probe.nativeDsl
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(uuid) || probe.sourceUuid !== uuid) {
    throw new Error("原始 DSL 对应的 UUID 不匹配，拒绝导入")
  }
  if (typeof dsl !== "string" || !dsl.trim() || dsl.length > 2_000_000 ||
      !/\{title:[^}]+\}/.test(dsl)) {
    throw new Error("未取得有效的官方 DSL，不能把 SVG 当成曲谱入库")
  }
  const title = probe.sourceTitle || titleOf(song)
  const artist = song.music_composer || probe.sourceComposer || ""
  const key = (probe.sourceKey || "C").replace(/^1=/, "") || "C"
  const timeSignature = probe.sourceRhythm || "4/4"
  const content = {
    title, artist, key, time_signature: timeSignature,
    source: {
      provider: "kuaiyuepu", uuid,
      source_url: `https://www.kuaiyuepu.com/jianpu/${uuid}.html`,
      native_dsl: dsl, render_engine: "hc.js",
      fidelity: "original native DSL; no simplification",
    },
  }
  // Check source UUID before writing. Never overwrite a different arrangement.
  const baseURL = mySheetConnection().url
  const library = await readJson<LibraryItem[]>(baseURL + "/api/songs")
  if (!Array.isArray(library)) throw new Error("MySheet 曲库接口格式异常")
  for (const row of library) {
    const existing = await readJson<SongRecord>(baseURL + "/api/songs/" + row.id)
    let source: any
    try { source = JSON.parse(existing.content_json)?.source } catch { continue }
    if (source?.provider === "kuaiyuepu" && source?.uuid === uuid) {
      if (!verifiedRecord(existing, uuid, dsl)) {
        throw new Error("曲库已有同 UUID 但 DSL 不一致的版本，未覆盖原有曲谱")
      }
      return { id: existing.id, alreadyExists: true }
    }
  }
  const record = await readJson<SongRecord>(baseURL + "/api/songs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title, artist, key, time_signature: timeSignature,
      content_json: JSON.stringify(content),
    }),
  })
  if (!Number.isSafeInteger(record?.id) || record.id <= 0) {
    throw new Error("MySheet 未返回有效歌曲 ID，无法确认入库")
  }
  // A successful HTTP 201 alone is insufficient: read SQLite-backed API back.
  const persisted = await readJson<SongRecord>(baseURL + "/api/songs/" + record.id)
  if (!verifiedRecord(persisted, uuid, dsl)) {
    throw new Error("写入后回读的原生 DSL 不一致，请检查服务器数据")
  }
  return { id: record.id, alreadyExists: false }
}
