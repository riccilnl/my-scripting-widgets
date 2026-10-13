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

function createPagedRimeSession(total, pageSize, initialPage = 0, initialHighlight = 0) {
  let page = initialPage;
  let highlight = initialHighlight;
  const counts = { pageDown: 0, pageUp: 0, highlight: 0, context: 0 };
  const session = {
    get context() {
      counts.context++;
      const from = page * pageSize;
      return { menu: {
        pageNo: page, pageSize,
        highlightedIndex: highlight,
        isLastPage: from + pageSize >= total,
        candidates: Array.from({ length: Math.min(pageSize, Math.max(0, total - from)) },
          (_, index) => ({ text: "第" + (from + index), comment: null }))
      }};
    },
    processKey(key) {
      if (key === 0xff56 && (page + 1) * pageSize < total) {
        page++;
        highlight = 0;
        counts.pageDown++;
        return true;
      }
      if (key === 0xff55 && page > 0) {
        page--;
        highlight = 0;
        counts.pageUp++;
        return true;
      }
      if (key === 0xff54 && highlight + 1 < Math.min(pageSize, total - page * pageSize)) {
        highlight++;
        counts.highlight++;
        return true;
      }
      if (key === 0xff52 && highlight > 0) {
        highlight--;
        counts.highlight++;
        return true;
      }
      return false;
    }
  };
  return { session, counts, state: () => ({ page, highlight }) };
}

test("incremental candidate collector preserves exact original indices, order, hasMore and cursor", () => {
  const { RimeEngine } = load("core/rime/RimeEngine.ts", ["RimeEngine"], {
    KEY_PAGE_DOWN: 0xff56, KEY_PAGE_UP: 0xff55,
    KEY_UP: 0xff52, KEY_DOWN: 0xff54,
    KEY_ESCAPE: 0xff1b, T9_SCHEMA_ID: "wanxiang_t9"
  });
  for (const fixture of [
    { total: 50, size: 8, page: 0, highlight: 3 },
    { total: 41, size: 5, page: 1, highlight: 2 },
    { total: 19, size: 7, page: 0, highlight: 0 },
    { total: 68, size: 8, page: 2, highlight: 6 }
  ]) {
    const baseline = createPagedRimeSession(fixture.total, fixture.size, fixture.page, fixture.highlight);
    const optimized = createPagedRimeSession(fixture.total, fixture.size, fixture.page, fixture.highlight);
    const oldEngine = new RimeEngine(baseline.session);
    const newEngine = new RimeEngine(optimized.session);
    let accumulated = [];
    for (let limit = 8; limit <= fixture.total + 16; limit += 8) {
      const reference = oldEngine.collectCandidateBatch(limit);
      const next = newEngine.collectCandidateBatch(limit, accumulated.length);
      accumulated = [...accumulated, ...next.items];
      assert.deepEqual(JSON.parse(JSON.stringify(accumulated)),
        JSON.parse(JSON.stringify(reference.items)), JSON.stringify({ fixture, limit }));
      assert.equal(next.hasMore, reference.hasMore);
      assert.equal(optimized.state().page, fixture.page);
      assert.equal(optimized.state().highlight, fixture.highlight);
      assert.equal(baseline.state().page, fixture.page);
      assert.equal(baseline.state().highlight, fixture.highlight);
      assert.deepEqual(optimized.counts, baseline.counts);
    }
  }
});

test("incremental collector avoids rebuilding prior candidate wrappers without changing native work", () => {
  const { RimeEngine } = load("core/rime/RimeEngine.ts", ["RimeEngine"], {
    KEY_PAGE_DOWN: 0xff56, KEY_PAGE_UP: 0xff55,
    KEY_UP: 0xff52, KEY_DOWN: 0xff54,
    KEY_ESCAPE: 0xff1b, T9_SCHEMA_ID: "wanxiang_t9"
  });
  const old = createPagedRimeSession(1024, 8, 0, 3);
  const next = createPagedRimeSession(1024, 8, 0, 3);
  const before = new RimeEngine(old.session);
  const after = new RimeEngine(next.session);
  let baselineWrappers = 0;
  let incrementalWrappers = 0;
  let previousCount = 0;
  for (let limit = 96; limit <= 576; limit += 96) {
    const original = before.collectCandidateBatch(limit);
    const increment = after.collectCandidateBatch(limit, previousCount);
    baselineWrappers += original.items.length;
    incrementalWrappers += increment.items.length;
    previousCount += increment.items.length;
    assert.equal(previousCount, original.items.length);
    assert.equal(original.hasMore, increment.hasMore);
  }
  assert.equal(baselineWrappers, 2016);
  assert.equal(incrementalWrappers, 576);
  assert.equal(baselineWrappers - incrementalWrappers, 1440);
  assert.deepEqual(next.counts, old.counts);
  assert.equal(next.state().highlight, 3);
  assert.equal(next.state().page, 0);
});

test("Shift/Caps never mutates Rime and keyboard skips T9 publish for it", () => {
  let probes = 0;
  let peeks = 0;
  const engine = {
    peek: () => { peeks++; return { context: { preedit: "ni" }, commit: null }; },
    get asciiMode() { return false; },
    processKey() { probes++; throw Error("Shift must not process Rime"); },
    clearComposition() { probes++; throw Error("Shift must not clear Rime"); },
    toggleAsciiMode() { probes++; throw Error("Shift must not change mode"); }
  };
  const { InputController } = load("core/input/InputController.ts", ["InputController"], {
    KEY_BACKSPACE: 8, KEY_RETURN: 13, KEY_SPACE: 32
  });
  let state = { shifted: false, capsLocked: false, lastShiftTapAt: 0 };
  let first = new InputController(engine).dispatch({ type: "toggleShift" }, state, 1000);
  assert.equal(first.shifted, true);
  assert.equal(first.capsLocked, false);
  state = { shifted: first.shifted, capsLocked: first.capsLocked, lastShiftTapAt: first.lastShiftTapAt };
  const second = new InputController(engine).dispatch({ type: "toggleShift" }, state, 1200);
  assert.equal(second.capsLocked, true);
  assert.equal(second.shifted, true);
  assert.equal(probes, 0);
  assert.equal(peeks, 2);
  const root = fs.readFileSync(path.join(__dirname, "../keyboard/main.tsx"), "utf8");
  assert.match(root, /if \(!effect\.steps && command\.type !== "toggleShift"\) publish\(effect\.snapshot\);/);
});

test("grapheme segmenter is reused and produces unchanged character counts", () => {
  let created = 0;
  class SegmenterCounter {
    constructor() { created++; this.impl = new Intl.Segmenter(undefined, { granularity: "grapheme" }); }
    segment(text) { return this.impl.segment(text); }
  }
  const { backspaceUnitCount } = load("keyboard/edit/EditController.ts",
    ["backspaceUnitCount"], { Intl: { Segmenter: SegmenterCounter } });
  const inputs = ["", "hello", "A👨‍👩‍👧‍👦好", "🇸🇬", "e\u0301", "👍🏽👍🏽"];
  for (const input of inputs) {
    const oldValue = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(input)).length;
    assert.equal(backspaceUnitCount(input), oldValue);
  }
  assert.equal(created, 1);
  assert.equal(backspaceUnitCount("复合字符"), 4);
  assert.equal(created, 1);
});

test("keyboard editor disposal releases large undo data and leaves host untouched", () => {
  const calls = [];
  const host = { insertText(value) { calls.push(value); } };
  const { KeyboardEditController } = load("keyboard/edit/EditController.ts",
    ["KeyboardEditController"], { CustomKeyboard: host });
  const controller = new KeyboardEditController();
  controller.rememberDeletedText("字".repeat(50000));
  assert.equal(controller.deletedText.length, 50000);
  controller.dispose();
  assert.equal(controller.deletedText, "");
  assert.equal(controller.snapshot, null);
  assert.equal(controller.disposed, true);
  controller.restoreDeleted();
  controller.execute({ type: "deleteAll" });
  assert.deepEqual(calls, []);
});

test("T9 publish reads runtime mode/schema once before Lua probe", () => {
  const source = fs.readFileSync(path.join(root, "keyboard/main.tsx"), "utf8");
  const start = source.indexOf("  function publish(snapshot:");
  const end = source.indexOf("\n  function dispatch(", start);
  const publish = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(publish, /const t9Active = Boolean\(engine && !engine\.asciiMode && engine\.isT9BridgeTargetSchema\(\)\);/);
  assert.match(publish, /if \(t9Active && engine\) t9Options = engine\.queryT9PinyinOptions\(\);/);
  assert.match(publish, /const visiblePreedit = t9Active/);
  assert.equal((publish.match(/engine\.isT9BridgeTargetSchema\(\)/g) || []).length, 1);
  // setAsciiMode still samples after the Lua probe, preserving existing sequence.
  assert.match(publish, /if \(engine\) setAsciiMode\(engine\.asciiMode\)/);
});

test("keyboard metrics cache reuses geometry and invalidates on width/layout/skin changes", () => {
  const { resolveKeyboardMetrics, createKeyboardMetricsResolver } =
    load("layout/metrics.ts", ["resolveKeyboardMetrics", "createKeyboardMetricsResolver"]);
  const layout = { keyboardBodyHeight: 220, topSurfaceHeight: 46, requestedHeight: 278 };
  const geometry = {
    t9LeftColumn: { min: 40, max: 200, fraction: 0.19 },
    t9RightColumn: { min: 40, max: 90, fraction: 0.19 },
    numericLeftColumn: { min: 35, max: 75, fraction: 0.17 },
    numericRightColumn: { min: 35, max: 75, fraction: 0.17 }
  };
  const resolver = createKeyboardMetricsResolver();
  const a = resolver(390, layout, geometry);
  for (let i = 0; i < 100; i++) {
    assert.equal(resolver(390, layout, geometry), a);
  }
  const rotated = resolver(760, layout, geometry);
  assert.notEqual(rotated, a);
  assert.deepEqual(JSON.parse(JSON.stringify(rotated)),
    JSON.parse(JSON.stringify(resolveKeyboardMetrics(760, layout, geometry))));
  const changedLayout = { ...layout, keyboardBodyHeight: 240 };
  const changedSize = resolver(760, changedLayout, geometry);
  assert.notEqual(changedSize, rotated);
  assert.notEqual(changedSize.keyHeight, rotated.keyHeight);
  const changedGeometry = {
    ...geometry, t9LeftColumn: { ...geometry.t9LeftColumn, fraction: 0.27 }
  };
  const changedSkin = resolver(760, changedLayout, changedGeometry);
  assert.notEqual(changedSkin, changedSize);
  assert.notEqual(changedSkin.t9.leftWidth, changedSize.t9.leftWidth);
  assert.equal(resolver(760, changedLayout, changedGeometry), changedSkin);
  const source = fs.readFileSync(path.join(root, "keyboard/main.tsx"), "utf8");
  assert.match(source, /const metricsResolverRef = useRef<ReturnType<typeof createKeyboardMetricsResolver> \| null>\(null\);/);
  assert.match(source, /metricsResolverRef\.current!\(width, props\.layout, skin\.geometry\)/);
});

test("keyface memo cache remains tied to semantic and mode changes, not candidate state", () => {
  const view = fs.readFileSync(path.join(root, "keyboard/components/KeyView.tsx"), "utf8");
  assert.match(view, /const face = useMemo\(\(\) => projectBaseKeyFace\(/);
  assert.match(view, /\[definition, preferences, props\.shifted, props\.capsLocked, props\.asciiMode\]\)/);
  assert.doesNotMatch(view, /\[candidate|highlightedIndex/);
  assert.match(view, /const manualGesture = useMemo\(\(\) => \(\{/);
});

test("expanded grid reuses column and padded candidate arrays without changing hit layout", () => {
  const source = fs.readFileSync(path.join(root, "keyboard/components/ExpandedCandidatePanel.tsx"), "utf8");
  assert.match(source, /const columns = useMemo\(\(\) => Array\.from\([\s\S]*?\[cellWidth\]\)/);
  assert.match(source, /const cells = useMemo\(\(\) => \{/);
  assert.match(source, /while \(next\.length % COLUMN_COUNT !== 0\) next\.push\(null\)/);
  assert.match(source, /\}, \[props\.candidates\]\)/);
  assert.doesNotMatch(source, /<HStack/);
  assert.match(source, /<LazyVGrid/);
  assert.match(source, /spacing=\{0\}/);
  assert.match(source, /contentShape="rect"/);
});

test("Haptics start/dispose races do not recreate players after keyboard unmount", async () => {
  let releaseStart;
  const stats = { constructed: 0, stopped: 0, disposed: 0, createdPlayers: 0, transient: 0 };
  let owned;
  class Engine {
    static supportsHaptics = true;
    constructor() { stats.constructed++; owned = this; }
    startAsync() { return new Promise(resolve => { releaseStart = resolve; }); }
    stop() { stats.stopped++; }
    dispose() { stats.disposed++; }
    makePlayer() { stats.createdPlayers++; return { start() {} }; }
  }
  const { prepareKeyboardHaptics, playKeyboardHaptic, disposeKeyboardHaptics } = load(
    "keyboard/feedback/haptics.ts",
    ["prepareKeyboardHaptics", "playKeyboardHaptic", "disposeKeyboardHaptics"],
    { HapticEngine: Engine, Haptics: { supportsHaptics: true, transient() { stats.transient++; } },
      HapticPattern: class {}, HapticEvent: class {}, HapticEventParameter: class {} }
  );
  prepareKeyboardHaptics(true);
  assert.equal(stats.constructed, 1);
  disposeKeyboardHaptics();
  assert.equal(stats.stopped, 1);
  assert.equal(stats.disposed, 1);
  releaseStart();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(stats.createdPlayers, 0);
  owned.onStopped?.();
  owned.onReset?.();
  assert.equal(stats.constructed, 1);
  playKeyboardHaptic(false);
  assert.equal(stats.constructed, 1);
});

test("Haptics keeps only three reusable player objects during continuous typing", async () => {
  const stats = { createdPlayers: 0, played: 0, constructed: 0, disposed: 0 };
  class Engine {
    static supportsHaptics = true;
    constructor() { stats.constructed++; }
    startAsync() { return Promise.resolve(); }
    stop() {}
    dispose() { stats.disposed++; }
    makePlayer() {
      stats.createdPlayers++;
      return { start() { stats.played++; } };
    }
  }
  const { prepareKeyboardHaptics, playKeyboardHaptic, disposeKeyboardHaptics } = load(
    "keyboard/feedback/haptics.ts",
    ["prepareKeyboardHaptics", "playKeyboardHaptic", "disposeKeyboardHaptics"],
    { HapticEngine: Engine,
      HapticPattern: class {}, HapticEvent: class {}, HapticEventParameter: class {},
      Haptics: { supportsHaptics: true, transient() {} } }
  );
  prepareKeyboardHaptics(true);
  await Promise.resolve();
  await Promise.resolve();
  for (let i = 0; i < 100; i++) playKeyboardHaptic(true);
  assert.equal(stats.createdPlayers, 3);
  assert.equal(stats.played, 100);
  assert.equal(stats.constructed, 1);
  disposeKeyboardHaptics();
  assert.equal(stats.disposed, 1);
});

test("rejected native Haptics stop/dispose promises are settled after teardown", async () => {
  const stats = { stop: 0, dispose: 0 };
  class Engine {
    static supportsHaptics = true;
    startAsync() { return Promise.resolve(); }
    stop() { stats.stop++; return Promise.reject(new Error("native engine stopped")); }
    dispose() { stats.dispose++; return Promise.reject(new Error("native resource released")); }
    makePlayer() { return { start() {} }; }
  }
  const { prepareKeyboardHaptics, disposeKeyboardHaptics } = load(
    "keyboard/feedback/haptics.ts",
    ["prepareKeyboardHaptics", "disposeKeyboardHaptics"],
    { HapticEngine: Engine,
      HapticPattern: class {}, HapticEvent: class {}, HapticEventParameter: class {},
      Haptics: { supportsHaptics: true, transient() {} } }
  );
  prepareKeyboardHaptics(true);
  await Promise.resolve();
  await Promise.resolve();
  disposeKeyboardHaptics();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(stats.stop, 1);
  assert.equal(stats.dispose, 1);
});

test("async failure of fallback transient feedback is consumed without unhandled rejection", async () => {
  const stats = { attempts: 0 };
  const { playKeyboardHaptic, disposeKeyboardHaptics } = load(
    "keyboard/feedback/haptics.ts",
    ["playKeyboardHaptic", "disposeKeyboardHaptics"],
    { Haptics: { supportsHaptics: true,
      transient() { stats.attempts++; return Promise.reject(new Error("transient unavailable")); }
    } }
  );
  playKeyboardHaptic(true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(stats.attempts, 1);
  disposeKeyboardHaptics();
});

test("keyboard dismiss releases Core Haptics even when extension view stays mounted", () => {
  const source = fs.readFileSync(path.join(root, "keyboard/main.tsx"), "utf8");
  const start = source.indexOf("  function dismissKeyboard() {");
  const end = source.indexOf("\n  function renderKey(", start);
  const block = source.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(block, /CustomKeyboard\.dismiss\(\);[\s\S]*?disposeKeyboardHaptics\(\);/);
  assert.match(source, /onDismissKeyboard=\{dismissKeyboard\}/);
});

function runtimeFixture(overrides = {}) {
  const stats = { setup: 0, list: 0, sessions: 0, closed: 0 };
  let cancelled = false;
  let setupResolve;
  class Session {
    constructor() {
      stats.sessions++;
      if (overrides.cancelOnSession) cancelled = true;
    }
    get currentSchema() { return { id: "wanxiang" }; }
    close() { stats.closed++; }
  }
  const Rime = {
    isSetUp: !overrides.setupPending,
    Session,
    setup: () => {
      stats.setup++;
      return new Promise(resolve => { setupResolve = resolve; });
    },
    listSchemas: async () => { stats.list++; return [{ id: "wanxiang" }]; }
  };
  const { prepareKeyboardRimeRuntime, RimeRuntimeCancelled } =
    load("keyboard/runtime/RimeRuntimeCoordinator.ts",
      ["prepareKeyboardRimeRuntime", "RimeRuntimeCancelled"], {
        Rime,
        RimeEngine: class {
          constructor(session) { this.session = session; }
          get currentSchemaId() { return "wanxiang"; }
          close() { this.session.close(); }
        },
        listRuntimeSupportedRimeSchemes: items => items,
        resolveSchemaForChineseLayout: () => ({ id: "wanxiang", name: "万象" }),
        describeSchemes: () => "wanxiang",
        listInstalledRimeSchemes: async () => [],
        prepareT9BridgeRuntime: async () => ({ ready: true, changed: false })
      });
  return {
    stats, RimeRuntimeCancelled, prepareKeyboardRimeRuntime,
    setCancelled: () => { cancelled = true; },
    isCancelled: () => cancelled,
    resolveSetup: () => { if (setupResolve) setupResolve(); }
  };
}

test("late Rime setup completion after keyboard dismissal does not start schema or session", async () => {
  const f = runtimeFixture({ setupPending: true });
  const promise = f.prepareKeyboardRimeRuntime({
    chineseLayout: "qwerty", preferredSchemaId: "wanxiang",
    isCancelled: f.isCancelled
  });
  assert.equal(f.stats.setup, 1);
  f.setCancelled();
  f.resolveSetup();
  await assert.rejects(promise, err => err instanceof f.RimeRuntimeCancelled);
  assert.equal(f.stats.list, 0);
  assert.equal(f.stats.sessions, 0);
  assert.equal(f.stats.closed, 0);
});

test("cancel during native session constructor releases newly allocated Rime session", async () => {
  const f = runtimeFixture({ cancelOnSession: true });
  await assert.rejects(f.prepareKeyboardRimeRuntime({
    chineseLayout: "qwerty", preferredSchemaId: "wanxiang",
    isCancelled: f.isCancelled
  }), err => err instanceof f.RimeRuntimeCancelled);
  assert.equal(f.stats.sessions, 1);
  assert.equal(f.stats.closed, 1);
});

test("normal Rime initialization still returns open session with identical schema", async () => {
  const f = runtimeFixture();
  const engine = await f.prepareKeyboardRimeRuntime({
    chineseLayout: "qwerty", preferredSchemaId: "wanxiang"
  });
  assert.equal(engine.currentSchemaId, "wanxiang");
  assert.equal(f.stats.sessions, 1);
  assert.equal(f.stats.closed, 0);
  engine.close();
  assert.equal(f.stats.closed, 1);
});

test("keyboard teardown invalidates native haptics lifecycle callbacks", async () => {
  let live;
  class Engine {
    static supportsHaptics = true;
    constructor() { live=this; }
    startAsync() { return Promise.resolve(); }
    stop() { return Promise.resolve(); }
    dispose() { return Promise.resolve(); }
    makePlayer() { return { start() {} }; }
  }
  const h = load("keyboard/feedback/haptics.ts",
    ["prepareKeyboardHaptics", "disposeKeyboardHaptics"], {
      HapticEngine: Engine, HapticPattern: class {}, HapticEvent: class {},
      HapticEventParameter: class {}, Haptics: { supportsHaptics: true, transient() {} }
    });
  h.prepareKeyboardHaptics(true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(typeof live.onStopped, "function");
  assert.equal(typeof live.onReset, "function");
  h.disposeKeyboardHaptics();
  assert.equal(live.onStopped, null);
  assert.equal(live.onReset, null);
});
