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

test("cloud layout: navigation refresh, single search row and no loaded counters", () => {
  assert.match(source, /<Form\s+navigationTitle="云盘"/)
  assert.match(source, /toolbar=\{\s*<Toolbar>/)
  assert.match(source, /<ToolbarItem placement="topBarTrailing">/)
  assert.match(source, /title="刷新"\s+systemImage="arrow\.clockwise"/)
  assert.match(source, /title="搜索"\s+systemImage="magnifyingglass"/)
  assert.doesNotMatch(source, /推送列表 ·|已加载50\/50/)
  const cloud = source.slice(source.indexOf("function CloudView("), source.indexOf("function SettingsView("))
  assert.doesNotMatch(cloud, /loadingMore|loadMore\(false\)|<Section header=/)
  const searchRow = cloud.slice(cloud.indexOf("<HStack spacing={8}>"), cloud.indexOf("</HStack>"))
  assert.match(searchRow, /<TextField/)
  assert.match(searchRow, /title="搜索"/)
  assert.doesNotMatch(searchRow, /title="刷新"/)
})

test("search is submitted once, replaces library during loading and only then shows results", () => {
  const cloud = source.slice(source.indexOf("function CloudView("), source.indexOf("function SettingsView("))
  assert.match(cloud, /onChanged=\{setQuery\}/)
  assert.match(cloud, /action=\{\(\) => \{ void runSearch\(\) \}\}/)
  assert.match(cloud, /setSearchStage\("searching"\)/)
  assert.match(cloud, /if \(state\.cursor\) await scanRemaining\(generation\)/)
  assert.match(cloud, /setSearchResults\(searchCloudBooks\(state\.books, term\)\)/)
  assert.match(cloud, /setSearchStage\("results"\)/)
  assert.match(cloud, /searchStage === "searching" \? \(/)
  assert.match(cloud, /searchStage === "error" \? \(/)
  assert.match(cloud, /searchStage === "results" \? searchResults : items/)
  assert.doesNotMatch(cloud, /items\.filter\(\(item\) => item\.name/)
})

test("cloud progressively reads changes and globally sorts after full background index", () => {
  assert.match(source, /listPushBooksPage\(null\)/)
  assert.match(source, /listPushBooksPage\(cursor, undefined, 200\)/)
  assert.match(source, /state\.books = mergeChanges\(/)
  assert.match(source, /setItems\(state\.books\)/)
  assert.match(source, /state\.generation !== generation/)
  assert.match(source, /state\.scanPromise/)
  assert.match(source, /正在整理完整书库，按最新时间排序/)
  assert.match(source, /继续整理书库/)
  assert.doesNotMatch(source, /<List navigationTitle="云盘"/)
})

test("home primary send action has triple-height prominent control", () => {
  const home = source.slice(source.indexOf("function HomeView("), source.indexOf("function CloudView("))
  assert.match(home, /title="添加图书并发送"/)
  assert.match(home, /frame=\{\{ maxWidth: "infinity", minHeight: 138 \}\}/)
  assert.match(home, /buttonStyle="borderedProminent"/)
  assert.match(home, /controlSize="large"/)
  assert.match(home, /action=\{chooseAndSend\}/)
})

test("gateway recovery stays available for first and background pages", () => {
  assert.match(source, /listPushBooksPage\(null\)/)
  assert.match(source, /listPushBooksPage\(cursor, undefined, 200\)/)
  assert.match(source, /state\.generation === generation/)
  assert.doesNotMatch(source, /clearSession\(\).*正在整理完整书库/)
})
