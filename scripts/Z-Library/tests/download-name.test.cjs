const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const originalLoad = Module._load;
const known = new Set();
const writes = [];
const bytes = new TextEncoder().encode("sample epub content");
Module._load = function(name, parent, main) {
  if (name === "scripting") return {
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: {get: key => key === "content-type" ? "application/epub+zip" : null},
      arrayBuffer: async () => bytes.buffer
    }),
  };
  return originalLoad.call(this, name, parent, main);
};
global.Keychain = {
  get: key => key.includes("session") ? JSON.stringify({userid:"1234",userkey:"testkey"}) : null,
  set:()=>true,remove:()=>true
};
global.FileManager = {
  documentsDirectory: "/docs",
  exists: async file => known.has(file),
  createDirectory: async () => {},
  writeAsBytes: async (file,content) => {
    if (known.has(file)) throw new Error("Unwanted overwrite: " + file);
    known.add(file);
    writes.push({file,content});
  }
};
const api = require(path.resolve(__dirname, ".compiled/api.js"));
Module._load = originalLoad;
const book = {
  id:"934291",hash:"validhash",title:"江湖不肖生",author:"",language:"Chinese",
  year:"2026",extension:"EPUB",size:"1MB",cover:"",description:"",pages:""
};

test("book filename has no book ID or millisecond timestamp", async () => {
  const file = await api.chooseDownloadPath(book,"/docs/Z-Library", async () => false);
  assert.equal(file,"/docs/Z-Library/江湖不肖生.epub");
  assert.doesNotMatch(file,/-934291-\d+/);
});
test("collision uses visible sequential (2)/(3) without overwriting", async () => {
  const occupied = new Set(["/docs/Z-Library/江湖不肖生.epub", "/docs/Z-Library/江湖不肖生 (2).epub"]);
  assert.equal(await api.chooseDownloadPath(book,"/docs/Z-Library",async f=>occupied.has(f)),
    "/docs/Z-Library/江湖不肖生 (3).epub");
});
test("sanitize unsafe title, strip redundant extension, preserve Chinese and format", async () => {
  assert.equal(await api.chooseDownloadPath(
    {...book,title:'  Windows:/<魔法>*?.epub  ',extension:"EPUB"},
    "/docs/Z-Library",async () => false),
    "/docs/Z-Library/Windows_魔法_.epub");
  assert.equal(await api.chooseDownloadPath(
    {...book,title:"空白   文本.PDF",extension:"PDF"},
    "/docs/Z-Library",async()=>false),
    "/docs/Z-Library/空白 文本.pdf");
  assert.equal(await api.chooseDownloadPath(
    {...book,title:"   ",extension:"EPUB"},
    "/docs/Z-Library",async()=>false),
    "/docs/Z-Library/934291.epub");
});
test("complete download uses filename planner and never overwrites", async () => {
  known.clear();writes.length=0;
  const first=await api.download(book);
  const second=await api.download(book);
  assert.equal(first,"/docs/Z-Library/江湖不肖生.epub");
  assert.equal(second,"/docs/Z-Library/江湖不肖生 (2).epub");
  assert.equal(writes.length,2);
  assert.deepEqual([...writes[0].content], [...bytes]);
});
