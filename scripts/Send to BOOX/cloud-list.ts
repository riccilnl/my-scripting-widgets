import type { BooxPushBook } from "./boox"

export type PushMessagePage = { totalEntries: number; books: BooxPushBook[] }

function asObject(v: unknown): Record<string, any> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, any> : null
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function asTime(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n < 100000000000 ? n * 1000 : n
}

// The push/message endpoint is distinct from the versioned Sync Gateway.
// Records from this API are view-only, regardless of their metadata.
export function parsePushMessagePage(payload: unknown): PushMessagePage {
  const root = asObject(payload)
  const data = asObject(root?.data)
  const list = Array.isArray(root?.list) ? root.list
    : Array.isArray(data?.list) ? data.list
    : null
  if (list === null) throw new Error("BOOX 备用列表返回了未知数据格式")

  const books: BooxPushBook[] = []
  for (const raw of list) {
    const entry = asObject(raw)
    const entryData = asObject(entry?.data)
    const content = asObject(entryData?.args) || asObject(entry?.args) || entryData || entry
    if (!content) continue
    const name = text(content.name) || text(content.title) || text(entry?.name)
    if (!name) continue
    const formats = Array.isArray(content.formats) ? content.formats : []
    const inferred = name.includes(".") ? name.split(".").pop() : ""
    const ext = (text(formats[0]) || text(content.resourceType) || inferred || "").toLowerCase()
    const formatStorage = asObject(asObject(content.storage)?.[ext])
    const oss = asObject(formatStorage?.oss)
    const size = Number(content.size ?? oss?.size ?? entry?.size ?? 0)
    const createdAt = asTime(content.createdAt ?? entry?.createdAt)
    const updatedAt = asTime(content.updatedAt ?? entry?.updatedAt) || createdAt
    const id = text(content._id) || text(content.guid) || text(entry?.id)
    if (!id) continue
    books.push({
      id, rev: "", name, ext,
      size: Number.isFinite(size) && size >= 0 ? size : 0,
      createdAt, updatedAt,
      objectKey: text(oss?.key) || text(content.resourceKey) || null,
      doc: {}, content, source: "push_message",
    })
  }
  return { totalEntries: list.length, books }
}
