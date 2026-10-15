const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const source = fs.readFileSync(path.join(__dirname, "..", "index.tsx"), "utf8")
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "script.json"), "utf8"))

test("startup has three nonempty tabs with ordinary presentation", () => {
  assert.match(source, /<TabView selection=\{selection\}>/)
  assert.deepEqual([...source.matchAll(/<Tab title="([^"]+)"[^>]*value=\{(\d+)\}/g)].map(match => match[1]), ["首页", "云盘", "设置"])
  assert.doesNotMatch(source, /tabPlacement="pinned"|overFullScreen/)
  assert.match(source, /<Button title="关闭" systemImage="xmark" action=\{dismiss\}/)
  assert.match(source, /element: <App \/>/)
})

test("manifest retains sharing and stable update subscription", () => {
  assert.equal(manifest.entry, "index.tsx")
  assert.equal(manifest.author.name, "Ricci")
  assert.deepEqual(manifest.intentInputTypes, ["File URLs"])
  assert.equal(manifest.remoteResource.autoUpdateInterval, 3600)
  assert.equal(manifest.remoteResource.url, "https://raw.githubusercontent.com/riccilnl/my-scripting-widgets/refs/heads/main/Send%20to%20BOOX.scripting")
})

test("home shows recent status and direct login", () => {
  assert.match(source, /onAppear=\{\(\) => setRecent\(loadRecentSends\(\)\)\}/)
  assert.match(source, /checkmark\.circle\.fill/)
  assert.match(source, /exclamationmark\.circle\.fill/)
  assert.match(source, /<HomeView session=\{session\} onRequestLogin=\{\(\) => selection\.setValue\(2\)\}/)
})

test("region switching confirms before clearing credentials", () => {
  const x = source.slice(source.indexOf("const changeRegion ="), source.indexOf("const sendCode ="))
  assert.match(x, /await Dialog\.confirm/)
  assert.match(x, /if \(!confirmed\) return/)
  assert.ok(x.indexOf("await Dialog.confirm") < x.indexOf("clearSession()"))
  assert.match(source, /登录信息保存在本设备的 iOS 钥匙串/)
})

test("cloud retains the working Form and loads additional pages lazily", () => {
  assert.match(source, /<Form navigationTitle="云盘">/)
  assert.match(source, /listPushBooksPage\(null\)/)
  assert.match(source, /listPushBooksPage\(cursor\)/)
  assert.match(source, /mergeChanges\(current, page\.items\)/)
  assert.match(source, /onAppear=\{\(\) => \{ void loadMore\(false\) \}\}/)
  assert.match(source, /重试加载更多/)
  assert.match(source, /搜索仅覆盖已加载的图书/)
  assert.match(source, /state\.generation !== generation/)
  assert.match(source, /state\.retryRequired = true/)
  assert.doesNotMatch(source, /<List navigationTitle="云盘"/)
})

test("gateway 504 recovery provides visible status and keeps original cloud view", () => {
  assert.match(source, /listPushBooksPage\(null, \(\) => \{/)
  assert.match(source, /网关暂时超时，正在检查登录状态并重试/)
  assert.match(source, /listPushBooksPage\(cursor, \(\) => \{/)
  assert.match(source, /下一批加载超时，正在检查登录状态并重试/)
  assert.match(source, /state\.generation === generation/)
  assert.doesNotMatch(source, /<List navigationTitle="云盘"/)
})
