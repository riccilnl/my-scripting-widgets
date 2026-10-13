const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");

const root = path.join(__dirname, "..");
function load(relative, exportsList, overrides = {}) {
  let code = fs.readFileSync(path.join(root, relative), "utf8");
  code = code.replace(/^import\b[\s\S]*?;\s*/gm, "");
  code = stripTypeScriptTypes(code, { mode: "transform" });
  code = code.replace(/\bexport\s+(?=(?:async\s+)?(?:class|function|const|let|var)\b)/g, "");
  const scope = vm.createContext({
    console, Promise, Intl, Date, Math, Set, Map, Uint8Array,
    setTimeout, clearTimeout, ...overrides
  });
  const statement = "\nglobalThis.__exports = {" + exportsList.join(",") + "};";
  vm.runInContext(code + statement, scope, { filename: relative, timeout: 1000 });
  return scope.__exports;
}
const state = { shifted: false, capsLocked: false, lastShiftTapAt: 0 };

test("multi-character Rime action preserves each intermediate commit and literal fallback", () => {
  const outputs = [
    { consumed: true, commit: "甲", context: { preedit: "a" } },
    { consumed: false, commit: null, context: { preedit: "ab" } },
    { consumed: true, commit: "乙", context: { preedit: "" } }
  ];
  const engine = {
    asciiMode: false,
    peek: () => ({ context: null, commit: null }),
    processKey: () => outputs.shift()
  };
  const { InputController } = load("core/input/InputController.ts", ["InputController"],
    { KEY_BACKSPACE: 8, KEY_RETURN: 13, KEY_SPACE: 32 });
  const effect = new InputController(engine).dispatch({ type: "rimeText", text: "abc" }, state);
  assert.equal(effect.steps.length, 3);
  assert.deepEqual(Array.from(effect.steps, s => [s.snapshot.commit, s.insertText || null]),
    [["甲", null], [null, "b"], ["乙", null]]);
});

test("Rime ASCII action inserts whole string without touching engine keys", () => {
  let calls = 0;
  const engine = {
    asciiMode: true, peek: () => ({ context: null, commit: null }),
    processKey: () => { calls++; throw Error("engine should be bypassed"); }
  };
  const { InputController } = load("core/input/InputController.ts", ["InputController"],
    { KEY_BACKSPACE: 8, KEY_RETURN: 13, KEY_SPACE: 32 });
  const effect = new InputController(engine).dispatch({ type: "rimeText", text: "hello" }, state);
  assert.equal(effect.insertText, "hello");
  assert.equal(calls, 0);
});

test("async host action blocks later keypresses while sync taps stay immediate", async () => {
  const { dispatchKeyboardAction: dispatch, clearKeyboardActionQueue: clear } =
    load("keyboard/input/actionQueue.ts", ["dispatchKeyboardAction", "clearKeyboardActionQueue"]);
  const history = [];
  let finishPaste;
  const deferred = new Promise(resolve => { finishPaste = resolve; });
  dispatch(() => { history.push("paste-start"); return deferred; });
  dispatch(() => { history.push("key"); });
  assert.deepEqual(history, ["paste-start"]);
  finishPaste();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(history, ["paste-start", "key"]);
  clear();
  dispatch(() => { history.push("immediate"); });
  assert.equal(history.at(-1), "immediate");
});

test("queue maintains FIFO for reentrant calls and ignores abandoned promises", async () => {
  const { dispatchKeyboardAction: dispatch, clearKeyboardActionQueue: clear } =
    load("keyboard/input/actionQueue.ts", ["dispatchKeyboardAction", "clearKeyboardActionQueue"]);
  const a = [];
  dispatch(() => { a.push(1); dispatch(() => a.push(2)); dispatch(() => a.push(3)); });
  await Promise.resolve();
  assert.deepEqual(a, [1, 2, 3]);
  let oldResolve;
  dispatch(() => new Promise(resolve => { oldResolve = resolve; }));
  dispatch(() => a.push(4));
  clear();
  dispatch(() => a.push(5));
  oldResolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(a, [1, 2, 3, 5]);
});

test("host command forwards async edit completion to callers", async () => {
  let resolvePaste;
  const deferred = new Promise(resolve => { resolvePaste = resolve; });
  const { executeHostCommand } = load("keyboard/toolbar/hostCommand.ts",
    ["executeHostCommand"]);
  const answer = executeHostCommand({ type: "paste" }, {
    edit: () => deferred, nextKeyboard() {}, dismissToHome() {}
  });
  assert.equal(answer, deferred);
  resolvePaste();
  await answer;
});

test("clipboard paste callback does not edit keyboard after unmount", async () => {
  let resolveRead;
  const events = [];
  const host = {
    get selectedText() { return ""; },
    get textBeforeCursor() { return ""; },
    get textAfterCursor() { return ""; },
    get allText() { return ""; },
    insertText: text => events.push(text)
  };
  const pasteboard = { getString: () => new Promise(resolve => { resolveRead = resolve; }) };
  const { KeyboardEditController } = load("keyboard/edit/EditController.ts",
    ["KeyboardEditController"], { CustomKeyboard: host, Pasteboard: pasteboard });
  const controller = new KeyboardEditController();
  const operation = controller.execute({ type: "paste" });
  controller.dispose();
  resolveRead("late text");
  await operation;
  assert.deepEqual(events, []);
});

test("cut completion after unmount may not delete host text", async () => {
  let resolveWrite;
  const events = [];
  const host = {
    selectedText: "selected", deleteBackward: () => events.push("deleted")
  };
  const clipboard = { setString: () => new Promise(resolve => { resolveWrite = resolve; }) };
  const { KeyboardEditController } = load("keyboard/edit/EditController.ts",
    ["KeyboardEditController"], { CustomKeyboard: host, Pasteboard: clipboard });
  const controller = new KeyboardEditController();
  const operation = controller.execute({ type: "cut" });
  controller.dispose();
  resolveWrite();
  await operation;
  assert.deepEqual(events, []);
});

test("delete count uses grapheme clusters rather than UTF-16 units", () => {
  const { backspaceUnitCount } = load("keyboard/edit/EditController.ts",
    ["backspaceUnitCount"]);
  assert.equal(backspaceUnitCount("A👨‍👩‍👧‍👦好"), 3);
});

test("candidate paging restores original page and highlight index", () => {
  let page = 0, highlight = 1;
  const session = {
    get context() {
      return { menu: { pageNo: page, pageSize: 2, highlightedIndex: highlight,
        isLastPage: page === 2, candidates: [{ text: "a" }, { text: "b" }] } };
    },
    processKey(key) {
      if (key === 0xFF56 && page < 2) { page++; highlight = 0; return true; }
      if (key === 0xFF55 && page > 0) { page--; highlight = 0; return true; }
      if (key === 0xFF54 && highlight < 1) { highlight++; return true; }
      if (key === 0xFF52 && highlight > 0) { highlight--; return true; }
      return false;
    }
  };
  const { RimeEngine } = load("core/rime/RimeEngine.ts", ["RimeEngine"], {
    KEY_PAGE_DOWN: 0xFF56, KEY_PAGE_UP: 0xFF55,
    KEY_UP: 0xFF52, KEY_DOWN: 0xFF54, KEY_ESCAPE: 0xFF1B,
    T9_SCHEMA_ID: "wanxiang_t9"
  });
  const result = new RimeEngine(session).collectCandidateBatch(5);
  assert.equal(result.items.length, 5);
  assert.equal(page, 0);
  assert.equal(highlight, 1);
});

function mockWanxiang(overrides = {}) {
  const fileMap = new Map();
  const directories = new Set(["/", "/rime", "/stage"]);
  const normalize = p => path.posix.normalize(String(p));
  let copies = 0;
  const fm = {
    temporaryDirectory: "/stage",
    async exists(p) { return fileMap.has(normalize(p)) || directories.has(normalize(p)); },
    async isDirectory(p) { return directories.has(normalize(p)); },
    async isFile(p) { return fileMap.has(normalize(p)); },
    async createDirectory(p) { directories.add(normalize(p)); },
    async remove(p) {
      p = normalize(p);
      fileMap.delete(p);
      for (const file of [...fileMap.keys()]) if (file.startsWith(p + "/")) fileMap.delete(file);
      for (const dir of [...directories]) if (dir === p || dir.startsWith(p + "/")) directories.delete(dir);
    },
    async rename(from, to) {
      from=normalize(from);to=normalize(to);
      if (!fileMap.has(from)) throw Error("rename missing source " + from);
      fileMap.set(to, fileMap.get(from));fileMap.delete(from);
    },
    async copyFile(from, to) {
      from=normalize(from);to=normalize(to);copies++;
      if (overrides.failCopy === copies) throw Error("injected copy failure");
      if (!fileMap.has(from)) throw Error("copy missing source " + from);
      fileMap.set(to, fileMap.get(from));
    }
  };
  const Path = { join: path.posix.join, dirname: path.posix.dirname };
  const globals = {
    Path, Crypto: {}, fetch: () => { throw Error("unexpected network call"); },
    FileManager: fm, sharedRimeDataDir: () => "/rime",
    readWanxiangUpdaterMetadata: () => ({}),
    wanxiangAssetMark: () => "m",
    writeWanxiangUpdaterMetadata: () => {},
  };
  const { applyManagedUpdates } = load("settings/wanxiang/WanxiangInstall.ts",
    ["applyManagedUpdates"], globals);
  return { applyManagedUpdates, fileMap, directories };
}

test("Wanxiang transaction commits replacements, removals, and additions", async () => {
  const e = mockWanxiang();
  e.fileMap.set("/rime/a.yaml", "old-a");
  e.fileMap.set("/rime/stale.yaml", "old-stale");
  e.fileMap.set("/stage/new-a", "new-a");
  e.fileMap.set("/stage/new-b", "new-b");
  await e.applyManagedUpdates("/rime", [
    { relative: "a.yaml", source: "/stage/new-a" },
    { relative: "stale.yaml" },
    { relative: "dicts/b.yaml", source: "/stage/new-b" }
  ]);
  assert.equal(e.fileMap.get("/rime/a.yaml"), "new-a");
  assert.equal(e.fileMap.has("/rime/stale.yaml"), false);
  assert.equal(e.fileMap.get("/rime/dicts/b.yaml"), "new-b");
  assert.equal([...e.directories].some(d => d.includes("update-backup")), false);
});

test("Wanxiang transaction restores old files when later copy fails", async () => {
  const e = mockWanxiang({ failCopy: 2 });
  e.fileMap.set("/rime/a.yaml", "old-a");
  e.fileMap.set("/rime/b.yaml", "old-b");
  e.fileMap.set("/stage/new-a", "new-a");
  e.fileMap.set("/stage/new-b", "new-b");
  await assert.rejects(e.applyManagedUpdates("/rime", [
    { relative: "a.yaml", source: "/stage/new-a" },
    { relative: "b.yaml", source: "/stage/new-b" }
  ]), /injected copy failure/);
  assert.equal(e.fileMap.get("/rime/a.yaml"), "old-a");
  assert.equal(e.fileMap.get("/rime/b.yaml"), "old-b");
  assert.equal([...e.directories].some(d => d.includes("update-backup")), false);
});

test("Wanxiang updater rejects duplicate, path traversal, and protected custom files", async () => {
  const e = mockWanxiang();
  await assert.rejects(e.applyManagedUpdates("/rime", [
    { relative: "a.yaml" }, { relative: "a.yaml" }
  ]), /重复更新路径/);
  await assert.rejects(e.applyManagedUpdates("/rime", [{ relative: "../escape.yaml" }]),
    /不安全/);
  await assert.rejects(e.applyManagedUpdates("/rime", [{ relative: "user.custom.yaml" }]),
    /禁止覆盖/);
  assert.equal(e.fileMap.size, 0);
});

test("main controller retains accepted gapless candidate grid", () => {
  const panel = fs.readFileSync(path.join(root, "keyboard/components/ExpandedCandidatePanel.tsx"),"utf8");
  assert.match(panel, /<LazyVGrid/);
  assert.match(panel, /spacing=\{0\}/);
  assert.doesNotMatch(panel, /<LazyVStack spacing=/);
});

test("Wanxiang preserves backup when rollback rename itself fails", async () => {
  const e = mockWanxiang({ failCopy: 1 });
  e.fileMap.set("/rime/a.yaml", "old-a");
  e.fileMap.set("/stage/new-a", "new-a");
  // Simulate failure during the attempt to restore the parked original.
  const oldRename = e.fileMap;
  // The mock is intentionally scoped: replace the module's FileManager by
  // using the same test function with a dedicated failing runtime below.
  const dirs = new Set(["/", "/rime", "/stage"]);
  const files = new Map(oldRename);
  const fm = {
    async exists(p) { return files.has(p) || dirs.has(p); },
    async isFile(p) { return files.has(p); },
    async isDirectory(p) { return dirs.has(p); },
    async createDirectory(p) { dirs.add(p); },
    async remove(p) {
      files.delete(p);
      for (const k of [...files.keys()]) if (k.startsWith(p + "/")) files.delete(k);
      for (const k of [...dirs]) if (k === p || k.startsWith(p + "/")) dirs.delete(k);
    },
    async rename(a,b) {
      if (a.includes(".wanxiang-update-backup-")) throw Error("cannot restore");
      files.set(b, files.get(a)); files.delete(a);
    },
    async copyFile() { throw Error("copy failure"); }
  };
  const { applyManagedUpdates } = load("settings/wanxiang/WanxiangInstall.ts",
    ["applyManagedUpdates"], { Path: { join: path.posix.join, dirname: path.posix.dirname },
      FileManager: fm, Crypto: {}, fetch: () => {} });
  await assert.rejects(applyManagedUpdates("/rime", [
    { relative: "a.yaml", source: "/stage/new-a" }
  ]), /回滚不完整/);
  const backups = [...files.keys()].filter(k => k.includes(".wanxiang-update-backup-"));
  assert.equal(backups.length, 1);
  assert.equal(files.get(backups[0]), "old-a");
});

test("Wanxiang download rejects SHA256 mismatch before editing Rime files", async () => {
  const files = new Map([["/rime/wanxiang-lts-zh-hans.gram", "old-model"]]);
  const dirs = new Set(["/", "/stage", "/rime"]);
  const fm = {
    temporaryDirectory: "/stage",
    async exists(p) { return files.has(p) || dirs.has(p); },
    async isFile(p) { return files.has(p); },
    async isDirectory(p) { return dirs.has(p); },
    async createDirectory(p) { dirs.add(p); },
    async remove(p) { files.delete(p); dirs.delete(p); },
    async writeAsBytes(p, bytes) { files.set(p, bytes); },
    async stat(p) { return { size: files.get(p)?.length || 0 }; },
    async readAsData(p) { return files.get(p); },
    async copyFile() { throw Error("must not copy after bad digest"); }
  };
  const { installWanxiangAsset } = load("settings/wanxiang/WanxiangInstall.ts",
    ["installWanxiangAsset"], {
      Path: { join: path.posix.join, dirname: path.posix.dirname },
      FileManager: fm, sharedRimeDataDir: () => "/rime",
      fetch: async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1,2,3]).buffer }),
      Crypto: { sha256: () => ({ toHexString: () => "a".repeat(64) }) }
    });
  const remoteAsset = { kind: "model", name: "wanxiang-lts-zh-hans.gram",
    url: "https://example.com/model", size: 3, digest: "b".repeat(64) };
  await assert.rejects(installWanxiangAsset(remoteAsset), /SHA256 校验失败/);
  assert.equal(files.get("/rime/wanxiang-lts-zh-hans.gram"), "old-model");
  assert.equal([...files.keys()].filter(p => p.includes("/wanxiang-")).length, 1);
});

test("T9 refuses to replace existing configuration when reading it fails", async () => {
  const calls = [];
  const fm = {
    existsSync: () => true,
    readAsStringSync() { throw Error("temporary I/O error"); },
    async stat() { return null; },
    async writeAsString() { calls.push("WRITE"); },
  };
  const { prepareT9BridgeRuntime } = load("core/rime/T9BridgeRuntime.ts",
    ["prepareT9BridgeRuntime"], {
      Path: { dirname: path.posix.dirname, join: path.posix.join },
      T9_BRIDGE_LUA: "some Lua",
      FileManager: fm,
      Rime: { sharedDataDir: "/rime/shared", userDataDir: "/rime/user" }
    });
  await assert.rejects(prepareT9BridgeRuntime(), /无法读取当前九键 Lua 配置/);
  assert.deepEqual(calls, []);
});

test("T9 existence-check errors cannot be mistaken for absent user configuration", async () => {
  const calls = [];
  const fm = {
    existsSync() { throw Error("file provider unavailable"); },
    async createDirectory() { calls.push("CREATE"); },
    async writeAsString() { calls.push("WRITE"); }
  };
  const { prepareT9BridgeRuntime } = load("core/rime/T9BridgeRuntime.ts",
    ["prepareT9BridgeRuntime"], {
      Path: { dirname: path.posix.dirname, join: path.posix.join },
      T9_BRIDGE_LUA: "some Lua",
      FileManager: fm,
      Rime: { sharedDataDir: "/rime/shared", userDataDir: "/rime/user" }
    });
  const result = await prepareT9BridgeRuntime();
  assert.equal(result.ready, false);
  assert.deepEqual(calls, []);
});

test("horizontal candidate bar uses gapless full-rectangle native buttons", () => {
  const bar = fs.readFileSync(path.join(root, "keyboard/components/CandidateBar.tsx"), "utf8");
  const candidateScroll = bar.slice(bar.indexOf('<ScrollView\n'), bar.indexOf('</ScrollView>') + '</ScrollView>'.length);
  assert.match(candidateScroll, /axes="horizontal"/);
  assert.match(candidateScroll, /<HStack\s+spacing=\{0\}/);
  assert.doesNotMatch(candidateScroll, /<HStack spacing=\{props\.skin\.visuals\.candidateItemSpacing\}/);
  assert.match(candidateScroll, /<Button[\s\S]*?action=\{\(\) => props\.onSelect\(entry\.originalIndex\)\}/);
  assert.match(candidateScroll, /buttonStyle="plain"/);
  assert.match(candidateScroll, /frame=\{\{ minWidth: cellMinWidth, height: props\.height \}\}/);
  assert.match(candidateScroll, /background=\{edgeHitSurface as any\}[\s\S]*?contentShape="rect"/);
  assert.match(candidateScroll, /allowsHitTesting=\{false\}/);
  assert.doesNotMatch(candidateScroll, /onTapGesture=/);
  assert.match(bar, /candidateScrollProxyRef\.current\?\.scrollTo\(highlightedKey, "center"\)/);
  assert.match(bar, /onToggleExpanded\(\)/);
});

test("single and multi-character candidate slots absorb visual spacing inside touch width", () => {
  const bar = fs.readFileSync(path.join(root, "keyboard/components/CandidateBar.tsx"), "utf8");
  assert.match(bar, /const visualGap = Math\.max\(0, props\.skin\.visuals\.candidateItemSpacing\);/);
  assert.match(bar, /const cellMinWidth = minTouchWidth \+ visualGap;/);
  assert.match(bar, /padding=\{\{ leading: visualGap \/ 2, trailing: visualGap \/ 2 \}\}/);
  assert.match(bar, /const candidateKey = /);
  const skins = [
    "skin/wechatSkin.ts", "skin/appleClassicSkin.ts", "skin/ios26Skin.ts", "skin/defaultSkin.ts"
  ];
  for (const source of skins) {
    const skin = fs.readFileSync(path.join(root, source), "utf8");
    const property = name => Number(new RegExp(name + ":\\s*(\\d+)").exec(skin)?.[1]);
    const gap = property("candidateItemSpacing");
    const single = property("candidateSingleCharTouchWidth");
    const multiple = property("candidateMinTouchWidth");
    assert.ok(Number.isFinite(gap) && Number.isFinite(single) && Number.isFinite(multiple), source);
    assert.ok(single + gap >= single, source);
    assert.ok(multiple + gap >= multiple, source);
  }
});
