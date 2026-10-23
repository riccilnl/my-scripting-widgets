import { fetch } from "scripting"

export type Book = {
  id: string
  hash: string
  title: string
  author: string
  language: string
  year: string
  extension: string
  size: string
  cover: string
  description: string
  pages: string
}
export type Session = { userid: string; userkey: string }
export type BookPage = { books: Book[]; total: number }

const SESSION_KEY = "zlib-ios-session-v1"
const DOMAIN_KEY = "zlib-ios-domain-v1"
export const DOMAINS = ["z-lib.gd", "z-lib.gl", "z-library.ec", "zlib.bz", "article.sk", "articles.sk"]
export const DEFAULT_DOMAIN = "https://z-lib.gd"

const obj = (x: unknown): Record<string, any> => (x && typeof x === "object" && !Array.isArray(x)) ? x as Record<string, any> : {}
const value = (...items: unknown[]): string => {
  for (const item of items) if (item !== undefined && item !== null && String(item).trim()) return String(item).trim()
  return ""
}
export function domainURL(input: string): string {
  const url = new URL(input.trim())
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash || !DOMAINS.includes(url.hostname.toLowerCase())) {
    throw new Error("仅允许使用设置中列出的 HTTPS 服务域名")
  }
  return url.origin
}
export function readDomain(): string {
  try { return domainURL(Keychain.get(DOMAIN_KEY) || DEFAULT_DOMAIN) } catch { return DEFAULT_DOMAIN }
}
export function saveDomain(domain: string): void {
  if (!Keychain.set(DOMAIN_KEY, domainURL(domain))) throw new Error("无法保存站点设置")
  // Sessions are tied to the authenticated host. Switching host requires signing in again.
  Keychain.remove(SESSION_KEY)
}
export function readSession(): Session | null {
  const raw = Keychain.get(SESSION_KEY)
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as Session
    return /^[0-9]+$/.test(s.userid) && !!s.userkey && s.userkey.length < 256 ? s : null
  } catch { return null }
}
export function forgetSession(): void { Keychain.remove(SESSION_KEY) }
function storeSession(s: Session): void {
  if (!Keychain.set(SESSION_KEY, JSON.stringify(s))) throw new Error("Keychain 保存失败")
}
export function parseSession(payload: unknown, cookies = ""): Session | null {
  const root = obj(payload)
  const data = obj(root.data)
  const user = obj(root.user || data.user)
  const cookie = (name: string) => {
    const matched = cookies.match(new RegExp("(?:^|[;,] ?)" + name + "=([^; ,]+)"))
    return matched ? decodeURIComponent(matched[1]) : ""
  }
  const userid = value(root.remix_userid, root.remixUserId, data.remix_userid, data.remixUserId, user.remix_userid, user.id, root.userid, root.userId, cookie("remix_userid"))
  const userkey = value(root.remix_userkey, root.remixUserKey, data.remix_userkey, data.remixUserKey, user.remix_userkey, user.userkey, user.userKey, root.userkey, root.userKey, cookie("remix_userkey"))
  return /^[0-9]+$/.test(userid) && userkey.length > 3 && userkey.length < 256 ? { userid, userkey } : null
}
export async function importSession(userid: string, userkey: string): Promise<void> {
  const clean = parseSession({ userid: userid.trim(), userkey: userkey.trim() })
  if (!clean) throw new Error("会话 ID 或 Key 格式不正确")
  // Never store an unchecked session.
  await profile(clean)
  storeSession(clean)
}
const headers = (session: Session | null = readSession()): Record<string, string> => {
  const h: Record<string, string> = { Accept: "application/json", "User-Agent": "Scripting-ZLibrary/1.0 (iOS)" }
  if (session) {
    h["remix-userid"] = session.userid
    h["remix-userkey"] = session.userkey
    h.Cookie = "remix_userid=" + session.userid + "; remix_userkey=" + session.userkey
  }
  return h
}
function requireJSON(raw: string): Record<string, any> {
  if (/^\s*</.test(raw)) throw new Error("站点返回了网页或反爬验证页，请在设置中切换域名")
  let parsed: Record<string, any>
  try { parsed = obj(JSON.parse(raw)) } catch { throw new Error("服务器未返回有效 JSON") }
  if (parsed.success === 0 || parsed.success === false) throw new Error(value(parsed.error, parsed.message, "服务器拒绝请求"))
  return parsed
}
async function call(path: string, init?: { body?: string; session?: Session | null }): Promise<Record<string, any>> {
  const h = headers(init?.session)
  if (init?.body !== undefined) h["Content-Type"] = "application/x-www-form-urlencoded"
  const response = await fetch(readDomain() + path, {
    method: init?.body !== undefined ? "POST" : "GET",
    headers: h,
    ...(init?.body !== undefined ? { body: init.body } : {}),
  })
  const body = await response.text()
  if (!response.ok && !body.includes('"success"')) throw new Error("HTTP " + response.status + "：" + body.slice(0, 120).replace(/<[^>]*>/g, ""))
  return requireJSON(body)
}
function normalizeBook(x: unknown): Book | null {
  const b = obj(x)
  const id = value(b.id, b.bookId)
  const hash = value(b.hash, b.bookHash)
  if (!/^\d+$/.test(id) || !/^[a-zA-Z0-9]+$/.test(hash)) return null
  const author = Array.isArray(b.authors) ? b.authors.map((a: any) => value(obj(a).name, a)).join(", ") : value(b.author, b.authors)
  return {
    id, hash, title: value(b.title, b.name, "未命名书籍"),
    author, language: value(b.language), year: value(b.year),
    extension: value(b.extension, b.ext, b.format).toUpperCase(),
    size: value(b.filesizeString, b.filesize, b.size),
    cover: value(b.cover, b.coverUrl, b.cover_url, b.coverImage),
    description: value(b.description, b.summary), pages: value(b.pages, b.pageCount)
  }
}
export function parseBookPage(payload: unknown): BookPage {
  const p = obj(payload)
  const d = obj(p.data)
  const list = p.books || d.books || p.items || d.items || (Array.isArray(p.data) ? p.data : null)
  if (!Array.isArray(list)) throw new Error("书籍列表格式发生变化，请检查接口")
  return { books: list.map(normalizeBook).filter((b): b is Book => b !== null), total: Number(value(p.total, d.total, p.pagination?.total_items, d.pagination?.total_items, p.pagination?.total, d.pagination?.total, list.length)) || 0 }
}
// Cache the first page for repeat launches while keeping refresh explicit.
const RECENT_TTL_MS = 5 * 60 * 1000
type RecentCache = { domain: string; time: number; result: BookPage }
export function cachedRecent(): BookPage | null {
  try {
    const cache = Storage.get<RecentCache>("zlibrary-chinese-recent-v2")
    if (!cache || cache.domain !== readDomain() || !Number.isFinite(cache.time) ||
        Date.now() - cache.time > RECENT_TTL_MS || Date.now() < cache.time ||
        !Array.isArray(cache.result?.books)) return null
    return cache.result
  } catch { return null }
}
export async function recent(page = 1, force = false): Promise<BookPage> {
  const current = Math.max(1, page)
  if (current === 1 && !force) {
    const cache = cachedRecent()
    if (cache) return cache
  }
  // The old /recently endpoint often returns only {"success":1};
  // querying date-sorted Chinese books directly avoids the extra network RTT.
  const query = new URLSearchParams({
    message: "", order: "date", page: String(current), limit: "20"
  })
  query.append("languages[]", "chinese")
  const result = parseBookPage(await call("/eapi/book/search", { body: query.toString() }))
  if (current === 1) {
    try { Storage.set("zlibrary-chinese-recent-v2", {domain:readDomain(),time:Date.now(),result}) } catch { /* cache optional */ }
  }
  return result
}
export async function formats(book: Book): Promise<Book[]> {
  const payload = await call("/eapi/book/" + book.id + "/" + book.hash + "/formats")
  const list = payload.books || obj(payload.data).books
  if (!Array.isArray(list)) throw new Error("此书格式列表无法解析")
  const variants = list.map(normalizeBook).filter((b): b is Book => b !== null)
  const unique = new Map<string, Book>()
  for (const item of [book, ...variants]) {
    unique.set(item.id + ":" + item.hash, item)
  }
  return Array.from(unique.values())
}
export function preferredFormat(list: Book[]): Book | null {
  return list.find(b => b.extension.toLowerCase() === "epub") || list[0] || null
}
export async function search(message: string, page = 1, language = "", extension = "", yearFrom = "", yearTo = "", order = "relevance"): Promise<BookPage> {
  const values = new URLSearchParams()
  values.set("message", message.trim())
  values.set("page", String(Math.max(1, page)))
  values.set("limit", "20")
  if (order) values.set("order", order)
  if (language) values.append("languages[]", language)
  if (extension) values.append("extensions[]", extension.toLowerCase())
  if (/^\d{4}$/.test(yearFrom)) values.set("yearFrom", yearFrom)
  if (/^\d{4}$/.test(yearTo)) values.set("yearTo", yearTo)
  return parseBookPage(await call("/eapi/book/search", { body: values.toString() }))
}
export async function details(book: Book): Promise<Book> {
  const p = await call("/eapi/book/" + book.id + "/" + book.hash)
  return normalizeBook(p.book || obj(p.data).book || p.data) || book
}
export async function profile(session: Session = readSession() as Session): Promise<Record<string, any>> {
  if (!session) throw new Error("请先登录")
  const p = await call("/eapi/user/profile", { session })
  return obj(p.user || obj(p.data).user || p.data || p)
}
export async function login(email: string, password: string): Promise<void> {
  if (!email.includes("@") || !password) throw new Error("请输入邮箱和密码")
  const params = new URLSearchParams({ email: email.trim(), password })
  // Credentials stay on the chosen HTTPS host. A rejected login does not overwrite a valid session.
  let reason = ""
  try {
    const p = await call("/eapi/user/login", { body: params.toString(), session: null })
    const token = parseSession(p)
    if (!token) throw new Error("登录响应未包含可验证的会话凭据")
    await profile(token)
    storeSession(token)
    return
  } catch (e) { reason = String(e instanceof Error ? e.message : e) }
  // Do not guess or submit credentials to undocumented forms.
  throw new Error(reason + "。可使用网页登录后取得的个人会话 ID 与 Key 导入，或稍后重试。")
}
/**
 * User-facing filenames contain only the readable book title and format.
 * Numeric suffixes are used only for existing-name collisions.
 */
export async function chooseDownloadPath(
  book: Pick<Book, "id" | "title" | "extension">,
  folder: string,
  exists: (path: string) => Promise<boolean> = (path) => FileManager.exists(path)
): Promise<string> {
  const ext = /^[a-z0-9]{1,8}$/i.test(book.extension)
    ? book.extension.toLowerCase() : "bin"
  const title = (book.title || book.id)
    .replace(/[\/\\:*?"<>|\x00-\x1f]+/g, "_")
    .replace(/\s+/g, " ").replace(/[.\s]+$/g, "").trim()
    .replace(new RegExp("\\." + ext + "$", "i"), "")
    .slice(0, 100).replace(/[.\s]+$/g, "") || book.id
  const prefix = folder + "/" + title
  let path = prefix + "." + ext
  let suffix = 2
  while (await exists(path)) {
    if (suffix > 10000) throw new Error("同名文件过多，请整理下载文件夹")
    path = prefix + " (" + suffix++ + ")." + ext
  }
  return path
}

export async function download(book: Book): Promise<string> {
  if (!readSession()) throw new Error("请先在设置中登录账号")
  const url = readDomain() + "/eapi/book/" + book.id + "/" + book.hash + "/file"
  const response = await fetch(url, { headers: headers() })
  if (!response.ok) throw new Error("下载请求失败（HTTP " + response.status + "）")
  const type = (response.headers.get("content-type") || "").toLowerCase()
  let fileResponse = response
  if (type.includes("json")) {
    const p = requireJSON(await response.text())
    const target = value(p.url, p.downloadUrl, p.downloadLink, obj(p.file).downloadLink, obj(p.file).url, obj(p.data).url, obj(obj(p.data).file).downloadLink, obj(obj(p.data).file).url)
    if (!target) throw new Error("下载接口未返回可用文件链接")
    const remote = new URL(target, readDomain())
    if (remote.protocol !== "https:" || remote.username || remote.password) throw new Error("不安全的下载链接")
    fileResponse = await fetch(remote.toString()) // Do not forward auth to external file hosts.
    if (!fileResponse.ok) throw new Error("文件服务器返回 HTTP " + fileResponse.status)
  }
  const actualType = (fileResponse.headers.get("content-type") || "").toLowerCase()
  if (actualType.includes("text/html")) throw new Error("下载响应是验证网页，未保存为书籍")
  const announced = Number(fileResponse.headers.get("content-length") || "0")
  if (announced > 150 * 1024 * 1024) throw new Error("文件过大（上限 150MB）")
  const content = new Uint8Array(await fileResponse.arrayBuffer())
  if (!content.length) throw new Error("下载文件为空")
  if (content.length > 150 * 1024 * 1024) throw new Error("文件超过当前版本 150MB 限额")
  if (String.fromCharCode(...Array.from(content.slice(0, 15))).trim().startsWith("<!DOCTYPE") || String.fromCharCode(...Array.from(content.slice(0, 15))).trim().startsWith("<html")) throw new Error("服务器返回了网页而不是文件")
  const folder = FileManager.documentsDirectory + "/Z-Library"
  await FileManager.createDirectory(folder, true)
  const path = await chooseDownloadPath(book, folder)
  await FileManager.writeAsBytes(path, content)
  return path
}
