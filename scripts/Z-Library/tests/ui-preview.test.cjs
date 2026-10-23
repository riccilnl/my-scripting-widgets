const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname,"..");
const read = name => fs.readFileSync(path.join(root,name),"utf8");

test("one shared visual token palette uses semantic system colors", () => {
  const ui = read("ui-tokens.ts");
  assert.match(ui,/brand: "systemBlue"/);
  assert.match(ui,/primary: "label"/);
  assert.match(ui,/secondary: "secondaryLabel"/);
  assert.match(ui,/panel: "secondarySystemGroupedBackground"/);
  assert.match(ui,/coverWidth: 66/);
  assert.match(ui,/coverHeight: 94/);
  for (const part of ["catalog.tsx","results.tsx","detail.tsx","settings.tsx"])
    assert.match(read(part),/import \{ UI \} from "\.\/ui-tokens"/,part);
});

test("the shared book list retains uncropped covers and scroll paging", () => {
  const src=read("results.tsx");
  assert.match(src,/listStyle="plain"/);
  assert.match(src,/UI\.coverWidth/);
  assert.match(src,/UI\.coverHeight/);
  assert.match(src,/contentMode: "fit"/);
  assert.doesNotMatch(src,/contentMode: "fill"/);
  assert.match(src,/onScrollGeometryChange/);
  assert.match(src,/onScrollVisibilityChange/);
  assert.match(src,/onAppear=\{reachEnd\}/);
  assert.match(src,/ProgressView/);
});

test("search still supports blank query, native keyboard scrolling and second page navigation", () => {
  const src=read("catalog.tsx");
  assert.match(src,/scrollDismissesKeyboard="interactively"/);
  assert.match(src,/NavigationLink destination=\{<SearchResultsPage/);
  assert.match(src,/count: 2, span: 1/);
  assert.match(src,/saveSearchPrefs/);
  assert.match(src,/remember/);
  assert.doesNotMatch(src,/disabled=\{.*!query/);
  assert.doesNotMatch(src,/<GeometryReader/);
});

test("details keep noncropped cover, description clipping, choice and download toggling", () => {
  const src=read("detail.tsx");
  assert.match(src,/contentMode: "fit"/);
  assert.match(src,/lineLimit=\{5\}/);
  assert.match(src,/ScrollView axes="horizontal"/);
  assert.match(src,/buttonStyle=\{selected\.id === item\.id/);
  assert.match(src,/file \? "分享或另存文件"/);
  assert.match(src,/if \(file\) void ShareSheet\.present\(\[file\]\); else void save\(\)/);
  assert.match(src,/frame=\{\{ maxWidth: "infinity", alignment: "leading" \}\}/);
});

test("technical credentials are only on an advanced settings route", () => {
  const src=read("settings.tsx");
  assert.match(src,/function AdvancedSettings/);
  assert.match(src,/<NavigationLink destination=\{<AdvancedSettings/);
  assert.match(src,/navigationTitle="高级设置"/);
  const main=src.split("export function SettingsPage()")[1];
  assert.ok(main);
  assert.doesNotMatch(main,/remix_userid/);
  assert.doesNotMatch(main,/remix_userkey/);
  assert.match(main,/login\(email, password\)/);
  assert.match(main,/forgetSession\(\)/);
  assert.match(src,/importSession\(uid, ukey\)/);
});

test("tab selection, exit and session verification remain untouched", () => {
  const src=read("index.tsx");
  for (const tab of ['title="最新"','title="搜索"','title="设置"','title="退出"'])
    assert.ok(src.includes(tab));
  assert.match(src,/Script\.exit\(\)/);
  assert.match(src,/AppEvents\.scenePhase/);
});
