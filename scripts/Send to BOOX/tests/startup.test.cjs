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
