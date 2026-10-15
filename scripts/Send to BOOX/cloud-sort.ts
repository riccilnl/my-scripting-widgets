import type { BooxPushBook } from "./boox"

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
