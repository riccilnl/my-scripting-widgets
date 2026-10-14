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

test("cloud regression: preserve the 0.1.10 Form and simple refresh", () => {
  assert.match(source, /<Form navigationTitle="云盘">/)
  assert.match(source, /setStatus\("正在读取 BOOX 推送列表…"\)/)
  assert.match(source, /setLoading\(false\)/)
  assert.doesNotMatch(source, /requestRef\.current/)
  assert.doesNotMatch(source, /<List navigationTitle="云盘"/)
})
