const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const folder = path.resolve(__dirname, "..");
const read = f => fs.readFileSync(path.join(folder,f),"utf8");

test("all four tabs keep their semantics and use a symmetric exit icon", () => {
  const src=read("index.tsx");
  for (const label of ["最新","搜索","设置","退出"])
    assert.match(src, new RegExp('<Tab title="'+label+'"'));
  assert.match(src, /<Tab title="退出" systemImage="xmark\.circle"/);
  assert.doesNotMatch(src, /<Tab title="退出" systemImage="rectangle\.portrait\.and\.arrow\.right"/);
  assert.match(src, /if \(next === 3\)/);
  assert.match(src, /dismiss\(\)/);
});
test("book covers use supported native rounded clipping but never crop book imagery", () => {
  const token=read("ui-tokens.ts");
  assert.match(token,/radius: 11/);
  for(const p of ["results.tsx","detail.tsx"]){
    const text=read(p);
    assert.equal((text.match(/clipShape=\{\{ type: "rect", cornerRadius: UI\.radius \}\}/g)||[]).length,2,p);
    assert.equal((text.match(/contentMode: "fit"/g)||[]).length,2,p);
    assert.doesNotMatch(text,/contentMode: "fill"/,p);
  }
});
test("search controls are grouped, bounded for narrow screens and use native toggle", () => {
  const src=read("catalog.tsx");
  assert.match(src,/maxWidth: compact \? 68 : 150/);
  assert.match(src,/lineLimit=\{1\}>\{searchPrefsLabel/);
  assert.match(src,/background=\{UI\.panel\} clipShape=\{\{ type: "rect", cornerRadius: UI\.radius \}\}/);
  assert.match(src,/<ChoiceMenu compact options=\{YEAR_CHOICES\} selected=\{yearFrom\}/);
  assert.match(src,/<Toggle title="记住搜索偏好" value=\{remember\}/);
  assert.match(src,/onChanged=\{setRememberPreference\} toggleStyle="switch"/);
  assert.match(src,/frame=\{\{ maxWidth: "infinity", minHeight: UI\.touchHeight \}\}/);
  assert.match(src,/containerRelativeFrame=\{\{ axes: "horizontal", count: 2, span: 1/);
  assert.match(src,/ScrollView scrollDismissesKeyboard="interactively"/);
  assert.doesNotMatch(src,/!query\.trim\(\)/);
});
test("settings domain URL is placed below the label and is bounded", () => {
  const src=read("settings.tsx");
  const section=src.split('<Section title="连接和存储">')[1]?.split('</Section>')[0];
  assert.ok(section);
  assert.match(section,/VStack alignment="leading"/);
  assert.match(section,/<Text>当前站点<\/Text>/);
  assert.match(section,/lineLimit=\{2\}>\s*\{readDomain\(\)\}/);
  assert.doesNotMatch(section,/<Text font="caption" foregroundStyle=\{UI\.secondary\}>\{readDomain\(\)\}<\/Text>/);
});
test("compact detail cover leaves additional room for long titles", () => {
  const t=read("ui-tokens.ts");
  assert.match(t,/heroCoverWidth: 108/);
  assert.match(t,/heroCoverHeight: 154/);
  const detail=read("detail.tsx");
  assert.match(detail,/lineLimit=\{4\}/);
  assert.match(detail,/font="subheadline" lineLimit=\{2\}/);
  assert.match(detail,/frame=\{\{ maxWidth: "infinity", alignment: "leading" \}\}/);
});
