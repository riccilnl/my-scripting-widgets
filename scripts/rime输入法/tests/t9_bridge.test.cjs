const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

test("production T9 Lua bridge: digit, segment, candidate and commit simulation", () => {
  const root = path.join(__dirname, "..");
  const original = fs.readFileSync(path.join(root, "core/rime/T9BridgeAsset.ts"), "utf8");
  const embeddedLua = /^export const T9_BRIDGE_LUA = `([\s\S]*?)`;\s*$/m.exec(original);
  assert.ok(embeddedLua, "must extract exactly the production Lua source");

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "rime-t9-"));
  try {
    const bridgePath = path.join(temp, "bridge.lua");
    fs.writeFileSync(bridgePath, embeddedLua[1]);
    const result = spawnSync("luajit", [
      path.join(__dirname, "t9_bridge_simulation.lua"), bridgePath
    ], { encoding: "utf8", timeout: 15000 });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, (result.stdout || "") + (result.stderr || ""));
    assert.match(result.stdout, /^T9_BRIDGE_SIM_PASS sequences=540 assertions=\d+/m);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
