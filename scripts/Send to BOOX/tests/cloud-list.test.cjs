const test = require("node:test")
const assert = require("node:assert/strict")
const { parsePushMessagePage } = require(process.env.BOOX_CLOUD_LIST_MODULE)

const payload = {
  list: [{
    id: "push-1",
    data: {
      args: {
        _id: "book-1",
        name: "文档.pdf",
        formats: ["pdf"],
        storage: { pdf: { oss: { key: "u/push/1.pdf", size: 4096 } } },
        updatedAt: 1700000000000,
      },
    },
  }],
}

test("BOOX push/message response becomes a read-only cloud entry", () => {
  const page = parsePushMessagePage(payload)
  assert.equal(page.totalEntries, 1)
  assert.equal(page.books.length, 1)
  assert.equal(page.books[0].name, "文档.pdf")
  assert.equal(page.books[0].id, "book-1")
  assert.equal(page.books[0].rev, "")
  assert.equal(page.books[0].source, "push_message")
  assert.equal(page.books[0].objectKey, "u/push/1.pdf")
  assert.equal(page.books[0].size, 4096)
})

test("empty valid pages are distinguishable from malformed responses", () => {
  assert.deepEqual(parsePushMessagePage({ list: [] }), { totalEntries: 0, books: [] })
  assert.throws(() => parsePushMessagePage({ data: { count: 3 } }), /未知数据格式/)
  assert.equal(parsePushMessagePage({ data: { list: payload.list } }).books.length, 1)
})

test("parser ignores entries without book identity rather than inventing IDs", () => {
  const parsed = parsePushMessagePage({ list: [{ data: { args: { name: "no-id.pdf" } } }] })
  assert.equal(parsed.totalEntries, 1)
  assert.deepEqual(parsed.books, [])
})
