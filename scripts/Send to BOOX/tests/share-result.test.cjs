const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { summarizeShareAttempt } = require(process.env.BOOX_SHARE_RESULT_MODULE)
const intent = fs.readFileSync(path.join(__dirname, "..", "intent.tsx"), "utf8")
const item = (path, ok, detail) => ({ path, name: path.split("/").pop(), ok, detail })

test("all files succeed", () => {
  const result = summarizeShareAttempt(2, 0, ["/a.pdf", "/b.epub"], [item("/a.pdf", true), item("/b.epub", true)])
  assert.equal(result.completed, 2)
  assert.equal(result.message, "2 个文件均已发送到 BOOX")
  assert.deepEqual(result.remainingPaths, [])
})

test("retry contains only failed paths and preserves successful counts", () => {
  const first = summarizeShareAttempt(3, 0, ["/a.pdf", "/b.epub", "/c.pdf"], [
    item("/a.pdf", true), item("/b.epub", false, "网络失败"), item("/c.pdf", true),
  ])
  assert.equal(first.completed, 2)
  assert.deepEqual(first.remainingPaths, ["/b.epub"])
  assert.equal(first.failures[0].detail, "网络失败")
  const retry = summarizeShareAttempt(3, first.completed, first.remainingPaths, [item("/b.epub", true)])
  assert.equal(retry.completed, 3)
  assert.deepEqual(retry.remainingPaths, [])
})

test("complete failure and inconsistent result counts", () => {
  const first = summarizeShareAttempt(2, 0, ["/a.pdf", "/b.epub"], [
    item("/a.pdf", false, "无权限"), item("/b.epub", false),
  ])
  assert.deepEqual(first.remainingPaths, ["/a.pdf", "/b.epub"])
  assert.equal(first.failures[1].detail, "未能完成发送")
  assert.throws(() => summarizeShareAttempt(2, 0, ["/a.pdf", "/b.epub"], [item("/a.pdf", true)]))
})

test("share host preserves failed state and returns actual result", () => {
  assert.match(intent, /phase !== "success"/)
  assert.match(intent, /phase === "attention" && canRetry/)
  assert.match(intent, /重试未成功的文件/)
  assert.match(intent, /Script.exit\(Intent.text\(resultText\)\)/)
  assert.doesNotMatch(intent, /已结束/)
  assert.match(intent, /shareExtension: true/)
})
