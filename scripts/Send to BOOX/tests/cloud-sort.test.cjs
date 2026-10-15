const test = require("node:test")
const assert = require("node:assert/strict")
const { normalizeBooxTime, sortBooksLatest, searchCloudBooks } =
  require(process.env.BOOX_SORT_MODULE)

const book = (id, updatedAt, createdAt = updatedAt) => ({
  id, rev: "1-rev", name: id + ".pdf", size: 1, createdAt,
  updatedAt, ext: "pdf", objectKey: "x", doc: {}, content: {},
})

test("BOOX dates normalize Unix seconds, milliseconds and ISO date strings", () => {
  assert.equal(normalizeBooxTime(1700000000), 1700000000000)
  assert.equal(normalizeBooxTime("1700000000"), 1700000000000)
  assert.equal(normalizeBooxTime(1700000000000), 1700000000000)
  assert.equal(normalizeBooxTime("2024-01-01T00:00:00.000Z"), Date.parse("2024-01-01T00:00:00.000Z"))
  assert.equal(normalizeBooxTime(null), 0)
  assert.equal(normalizeBooxTime("bad"), 0)
})

test("all books are sorted latest first only after the full payload", () => {
  const received = [book("old", 1), book("mid", 3), book("new", 7)]
  const sorted = sortBooksLatest(received)
  assert.deepEqual(sorted.map(x => x.id), ["new", "mid", "old"])
  assert.deepEqual(received.map(x => x.id), ["old", "mid", "new"])
})

test("creation time is used for books missing updatedAt", () => {
  const sorted = sortBooksLatest([book("older", 0, 10), book("newer", 0, 20)])
  assert.deepEqual(sorted.map(x => x.id), ["newer", "older"])
})

test("search filters only a completed snapshot, sorted newest first", () => {
  const full = [
    { ...book("old", 2), name: "ALPHA Old.pdf" },
    { ...book("other", 4), name: "Unrelated.epub" },
    { ...book("new", 8), name: "alpha New.epub" },
  ]
  assert.deepEqual(searchCloudBooks(full, "  alpha ").map(x => x.id), ["new", "old"])
  assert.deepEqual(searchCloudBooks(full, "none"), [])
  assert.deepEqual(searchCloudBooks(full, "").map(x => x.id), ["new", "other", "old"])
})
