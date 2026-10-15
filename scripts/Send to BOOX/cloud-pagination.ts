import type { BooxPushBook } from "./boox"

export const BOOX_PUSH_PAGE_SIZE = 50
export type BooxChangesPage = { items: BooxPushBook[]; nextCursor: string | null; changeCount: number }

export function parseChangesPage(
  response: any,
  previous: string | null,
  limit: number,
  decode: (doc: Record<string, any>) => BooxPushBook | null,
): BooxChangesPage {
  if (!response || !Array.isArray(response.results)) throw new Error("BOOX 未返回变更列表")
  const rows = response.results
  if (rows.length > limit) throw new Error("BOOX 返回的变更条数超过请求上限")
  const unique = new Map<string, BooxPushBook>()
  for (const row of rows) {
    if (!row?.doc || row.deleted || row.removed) continue
    const item = decode(row.doc)
    if (item?.id) unique.set(item.id, item)
  }
  let nextCursor: string | null = null
  if (rows.length === limit) {
    const raw = response.last_seq
    nextCursor = typeof raw === "string" ? raw :
      typeof raw === "number" && Number.isFinite(raw) ? String(raw) :
      raw !== null && typeof raw === "object" ? JSON.stringify(raw) : null
    if (!nextCursor || nextCursor === previous) {
      throw new Error("BOOX 分页游标未更新，已停止重复加载")
    }
  }
  return { items: [...unique.values()], nextCursor, changeCount: rows.length }
}

/** BOOX metadata can use Unix seconds, milliseconds, or ISO dates. */
export function normalizeBooxTime(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return 0
  const raw = typeof value === "string" ? value.trim() : value
  if (raw === "") return 0
  const numeric = typeof raw === "number" ? raw : /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return 0
    return numeric < 100000000000 ? numeric * 1000 : numeric
  }
  if (typeof raw !== "string") return 0
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function sortBooksLatest(books: BooxPushBook[]): BooxPushBook[] {
  return [...books].sort((a, b) =>
    (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt) ||
    b.createdAt - a.createdAt || a.id.localeCompare(b.id))
}

export function searchCloudBooks(books: BooxPushBook[], query: string): BooxPushBook[] {
  const term = query.trim().toLocaleLowerCase()
  if (!term) return sortBooksLatest(books)
  return sortBooksLatest(books.filter(book =>
    book.name.toLocaleLowerCase().includes(term)))
}

export function mergeChanges(current: BooxPushBook[], next: BooxPushBook[]): BooxPushBook[] {
  const books = new Map<string, BooxPushBook>()
  for (const item of current) books.set(item.id, item)
  for (const item of next) books.set(item.id, item)
  return sortBooksLatest([...books.values()])
}
