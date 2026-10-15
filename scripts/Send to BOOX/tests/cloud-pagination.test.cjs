const test = require("node:test")
const assert = require("node:assert/strict")
const { BOOX_PUSH_PAGE_SIZE, parseChangesPage, mergeChanges, normalizeBooxTime, sortBooksLatest, searchCloudBooks } = require(process.env.BOOX_PAGINATION_MODULE)
const book = (id, updatedAt = 1) => ({
  id, rev: "1-rev", name: id + ".pdf", size: 1, createdAt: 1,
  updatedAt, ext: "pdf", objectKey: "x", doc: {}, content: {},
})
const decode = (doc) => doc.type === "digital_content" ? book(doc.id, doc.updatedAt) : null
const row = (id, updatedAt) => ({ id, doc: { id, updatedAt, type: "digital_content" } })

test("first page returns 50 changes and an opaque cursor", () => {
  assert.equal(BOOX_PUSH_PAGE_SIZE, 50)
  const rows = Array.from({ length: 50 }, (_, i) => row("book-" + i, i))
  const page = parseChangesPage({ results: rows, last_seq: "9:ABC/50" }, null, 50, decode)
  assert.equal(page.items.length, 50)
  assert.equal(page.changeCount, 50)
  assert.equal(page.nextCursor, "9:ABC/50")
})

test("short page is finished, irrespective of last_seq", () => {
  const result = parseChangesPage({ results: [row("a", 1)], last_seq: "new" }, "old", 50, decode)
  assert.equal(result.nextCursor, null)
  assert.equal(result.items.length, 1)
})

test("50 changes but only one book still requires another page", () => {
  const rows = Array.from({ length: 50 }, (_, i) =>
    i === 4 ? row("book", 5) : { id: String(i), doc: { type: "note" } })
  const page = parseChangesPage({ results: rows, last_seq: 51 }, null, 50, decode)
  assert.equal(page.items.length, 1)
  assert.equal(page.nextCursor, "51")
})

test("duplicate books are merged, later revision wins and list stays sorted", () => {
  const first = [book("a", 1), book("b", 2)]
  const merged = mergeChanges(first, [book("a", 7), book("c", 3)])
  assert.deepEqual(merged.map(x => x.id), ["a", "c", "b"])
  assert.equal(merged[0].updatedAt, 7)
})

test("invalid, absent and non-advancing cursor fail rather than loop", () => {
  const rows = Array.from({ length: 50 }, (_, i) => row("b" + i, i))
  assert.throws(() => parseChangesPage({ results: rows }, "old", 50, decode), /游标/)
  assert.throws(() => parseChangesPage({ results: rows, last_seq: "old" }, "old", 50, decode), /游标/)
  assert.throws(() => parseChangesPage({ list: [] }, null, 50, decode), /变更列表/)
  assert.throws(() => parseChangesPage({ results: [...rows, row("extra", 1)] }, null, 50, decode), /超过/)
})

test("object cursors stay JSON opaque; deleted records are excluded", () => {
  const rows = [{ id: "gone", deleted: true, doc: { id: "gone", type: "digital_content" } }]
  while (rows.length < 50) rows.push({ id: "note" + rows.length, doc: { type: "note" } })
  const cursor = { seq: 42, vv: "1:abc" }
  const page = parseChangesPage({ results: rows, last_seq: cursor }, null, 50, decode)
  assert.equal(page.nextCursor, JSON.stringify(cursor))
  assert.equal(page.items.length, 0)
})

test("BOOX timestamps normalize Unix seconds, milliseconds and ISO strings", () => {
  assert.equal(normalizeBooxTime(1700000000), 1700000000000)
  assert.equal(normalizeBooxTime("1700000000"), 1700000000000)
  assert.equal(normalizeBooxTime(1700000000000), 1700000000000)
  assert.equal(normalizeBooxTime("2024-01-01T00:00:00.000Z"), Date.parse("2024-01-01T00:00:00.000Z"))
  assert.equal(normalizeBooxTime("not-a-date"), 0)
  assert.equal(normalizeBooxTime(null), 0)
})

test("later change pages containing newer books move to top in global time sort", () => {
  const first = [book("old-1", 1700000000000), book("old-2", 1700100000000)]
  const next = [book("new-1", 1800000000000), book("new-2", 1800100000000)]
  const merged = mergeChanges(first, next)
  assert.deepEqual(merged.map(x => x.id), ["new-2", "new-1", "old-2", "old-1"])
  assert.deepEqual(sortBooksLatest(first).map(x => x.id), ["old-2", "old-1"])
})

test("search only consumes complete library array and returns sorted matches", () => {
  const books = [
    { ...book("alice", 2), name: "Alpha Story.pdf" },
    { ...book("beta", 5), name: "unrelated.epub" },
    { ...book("gamma", 9), name: "ALPHA Newest.epub" },
  ]
  assert.deepEqual(searchCloudBooks(books, "  alpha ").map(x => x.id), ["gamma", "alice"])
  assert.deepEqual(searchCloudBooks(books, "zzz"), [])
  assert.deepEqual(searchCloudBooks(books, "").map(x => x.id), ["gamma", "beta", "alice"])
})
