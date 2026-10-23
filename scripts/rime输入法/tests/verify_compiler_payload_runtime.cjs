"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const cp = require("node:child_process");
const { stripTypeScriptTypes } = require("node:module");

const repo = path.resolve(__dirname, "../../..");
const out = cp.execFileSync("git", ["rev-parse", "--git-path", "perf-preview"], {cwd: repo, encoding: "utf8"}).trim();
const zipPath = path.join(out, "Rime-compiler-payload-0.3.58-preview.scripting");
function packagedFile(relative) {
  return cp.execFileSync("python3", ["-B", "-c", [
    "import sys,zipfile",
    "with zipfile.ZipFile(sys.argv[1]) as z:",
    " sys.stdout.buffer.write(z.read('Rime编译负载实验/' + sys.argv[2]))"
  ].join("\n"), zipPath, relative], { encoding: "utf8" });
}
function loadRuntime(overrides = {}) {
  let code = packagedFile("core/rime/T9BridgeRuntime.ts");
  code = code.replace(/^import\b[\s\S]*?;\s*/gm, "");
  code = stripTypeScriptTypes(code, { mode: "transform" });
  code = code.replace(/\bexport\s+(?=(?:async\s+)?(?:class|function|const|let|var)\b)/g, "");
  const scope = vm.createContext({
    console, Promise, Intl, Date, Math, Set, Map, Uint8Array,
    Path: { join: path.posix.join, dirname: path.posix.dirname },
    ...overrides
  });
  vm.runInContext(code + "\nglobalThis.__fn = prepareT9BridgeRuntime;",
    scope, { filename: "optimized-T9BridgeRuntime.ts", timeout: 1000 });
  return scope.__fn;
}

test("frozen packaged Lua bytes are exactly the former JS template payload", () => {
  const original = fs.readFileSync(path.join(repo, "scripts/rime输入法/core/rime/T9BridgeAsset.ts"), "utf8");
  const prefix = "export const T9_BRIDGE_LUA = " + String.fromCharCode(96);
  assert.ok(original.startsWith(prefix) && original.endsWith(String.fromCharCode(96) + ";\n"));
  const expected = original.slice(prefix.length, -3);
  assert.equal(packagedFile("core/rime/t9_bridge.lua"), expected);
  assert.ok(packagedFile("keyboard.tsx").includes("function main()"));
  assert.ok(!packagedFile("core/rime/T9BridgeRuntime.ts").includes("T9BridgeAsset"));
});

test("verified T9 fast path does NOT load the packaged Lua asset", async () => {
  const observed = [];
  const m = {version: 1,
    lua: {size:100,modificationDate:222},
    custom: {size:200,modificationDate:333}};
  const fm = {
    statSync(p) {
      observed.push(["stat",p]);
      return p.endsWith(".lua")
        ? {size:100,modificationDate:222}
        : {size:200,modificationDate:333};
    },
    existsSync() { throw Error("No exists or Lua payload reads allowed on the fast path"); }
  };
  const run = loadRuntime({
    FileManager:fm,
    Storage:{get:()=>m},
    Rime:{sharedDataDir:"/rime/shared",userDataDir:"/rime/user"},
    // If compiler optimization accidentally accesses Script on the fast path,
    // this missing Script property intentionally exposes the regression.
  });
  const state = await run();
  assert.equal(state.ready,true);
  assert.equal(state.changed,false);
  assert.equal(observed.length,2);
});

test("T9 stale repair reads packaged Lua and installs identical bytes", async () => {
  const payload = packagedFile("core/rime/t9_bridge.lua");
  const disk = new Map([
    ["/app/core/rime/t9_bridge.lua",payload],
    ["/rime/user/lua/t9_bridge.lua","OLD"],
    ["/rime/shared/wanxiang_t9.custom.yaml","patch:\n"]
  ]);
  const writes = [];
  let deployments = 0;
  const fm = {
    existsSync: (p) => disk.has(p) ||
      p === "/rime/user" || p === "/rime/user/lua" || p === "/rime/shared",
    readAsStringSync: p => disk.get(p),
    writeAsStringSync(p,v) { writes.push(p); disk.set(p,v); },
    statSync(p) {const data = disk.get(p);return data==null?null:
      {size:Buffer.byteLength(data), modificationDate: 1};}
  };
  const run = loadRuntime({
    FileManager:fm, Script:{directory:"/app"},
    Storage:{get:()=>null,set:()=>true},
    Rime:{sharedDataDir:"/rime/shared",userDataDir:"/rime/user",
      async deploy(){deployments++;}}
  });
  const state=await run();
  assert.equal(state.ready,true);
  assert.equal(state.changed,true);
  assert.equal(disk.get("/rime/user/lua/t9_bridge.lua"),payload);
  assert.ok(disk.get("/rime/shared/wanxiang_t9.custom.yaml").includes("lua_processor@*t9_bridge*processor"));
  assert.ok(disk.get("/rime/shared/wanxiang_t9.custom.yaml").includes("lua_filter@*t9_bridge*filter"));
  assert.equal(deployments,1);
  assert.equal(writes.length,2);
});

test("missing packaged Lua aborts before touching user's T9 files", async () => {
  const writes = [];
  const fm = {
    existsSync:() => true,
    readAsStringSync:p=> p.endsWith("t9_bridge.lua") ? "OLD" : "patch:\n",
    writeAsStringSync:(p)=>writes.push(p),
    statSync:()=>null
  };
  const run=loadRuntime({
    FileManager:fm, Script:{directory:""},
    Storage:{get:()=>null},
    Rime:{sharedDataDir:"/rime/shared",userDataDir:"/rime/user"}
  });
  await assert.rejects(run(), /无法定位预览键盘脚本目录/);
  assert.deepEqual(writes,[]);
});
