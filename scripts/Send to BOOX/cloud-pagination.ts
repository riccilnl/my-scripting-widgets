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

export function mergeChanges(current: BooxPushBook[], next: BooxPushBook[]): BooxPushBook[] {
  const books = new Map<string, BooxPushBook>()
  for (const item of current) books.set(item.id, item)
  for (const item of next) books.set(item.id, item)
  return [...books.values()].sort((a, b) =>
    (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
}
