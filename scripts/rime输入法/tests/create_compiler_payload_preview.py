#!/usr/bin/env python3
"""Archive-only experiment: move frozen T9 Lua out of eager TypeScript imports."""
from __future__ import annotations

import hashlib
import json

from create_perf_preview import OUT, source_files, write_package

PROJECT = "Rime编译负载实验"
VERSION = "0.3.58"
FILENAME = "Rime-compiler-payload-0.3.58-preview.scripting"
TS_ASSET = "core/rime/T9BridgeAsset.ts"
ASSET = "core/rime/t9_bridge.lua"
RUNTIME = "core/rime/T9BridgeRuntime.ts"

OLD_IMPORT = 'import { T9_BRIDGE_LUA } from "./T9BridgeAsset";\n'
OLD_CODE = '''  if (oldLua !== T9_BRIDGE_LUA) {
    if (!(await writeText(fm, luaPath, T9_BRIDGE_LUA))) return { ready: false, changed: false };
    luaChanged = true;
  }
'''
NEW_CODE = '''  // Loaded only on the existing repair path, never during the verified fast path.
  // If the archive resource is missing, refuse to write into the user's Rime data.
  const scriptDir = String((globalThis as any).Script?.directory ?? "").trim();
  if (!scriptDir) throw new Error("无法定位预览键盘脚本目录，已取消九键修复");
  const assetPath = String(Path.join(scriptDir, "core", "rime", "t9_bridge.lua")).trim();
  const sourceLua = await readText(fm, assetPath);
  if (!sourceLua) throw new Error("无法读取预览键盘 Lua 文件，已取消九键修复");
  if (oldLua !== sourceLua) {
    if (!(await writeText(fm, luaPath, sourceLua))) return { ready: false, changed: false };
    luaChanged = true;
  }
'''


def transform() -> tuple[dict[str, bytes], dict[str, object]]:
    files = source_files()
    source = files[TS_ASSET].decode("utf-8")
    opening = "export const T9_BRIDGE_LUA = " + chr(96)
    assert source.startswith(opening) and source.endswith(chr(96) + ";\n")
    lua = source[len(opening):-3]
    assert lua.endswith("\n") and chr(96) not in lua
    assert chr(92) not in lua and chr(36) + "{" not in lua, "JS template escaping requires review"
    old = files[RUNTIME].decode("utf-8")
    assert old.count(OLD_IMPORT) == 1 and old.count(OLD_CODE) == 1
    modified = old.replace(OLD_IMPORT, "").replace(OLD_CODE, NEW_CODE)
    assert "T9_BRIDGE_LUA" not in modified
    del files[TS_ASSET]
    files[ASSET] = lua.encode("utf-8")
    files[RUNTIME] = modified.encode("utf-8")
    meta = json.loads(files["script.json"])
    assert meta["version"] == "0.3.44" and meta["remoteResource"] is None
    meta["author"]["name"] = "Ricci"
    files["script.json"] = (json.dumps(meta, ensure_ascii=False, indent=2) + "\n").encode()
    return files, {
        "frozen_lua_sha256": hashlib.sha256(files[ASSET]).hexdigest(),
        "frozen_lua_bytes": len(files[ASSET]),
        "eliminated_ts_bytes": len(source.encode("utf-8")),
        "asset_path": ASSET,
        "importer_path": RUNTIME
    }


def build() -> dict[str, object]:
    files, audit = transform()
    result = write_package(files, PROJECT, "Rime 编译负载实验", VERSION, FILENAME,
                           english_name="Rime Compiler Payload Experiment")
    result["audit"] = audit
    (OUT / "compiler-payload-manifest.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result


if __name__ == "__main__":
    build()
