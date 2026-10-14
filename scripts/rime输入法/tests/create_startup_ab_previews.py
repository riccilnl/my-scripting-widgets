#!/usr/bin/env python3
"""Build two immutable isolated keyboard startup controls from the 0.3.57 preview.

A retains the original entry dependency graph but substitutes a minimal first view.
B carries the same minimal view and native options with no Rime modules.
Never changes the normal diagnostic keyboard or official release.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import zipfile

from create_perf_preview import OUT, source_files, write_package

VERSION = "0.1.0"
OUT_NAMES = {
    "full-deps": "Rime-startup-ab-full-deps-0.1.0.scripting",
    "minimal-deps": "Rime-startup-ab-minimal-deps-0.1.0.scripting",
}
PROJECTS = {
    "full-deps": ("Rime启动对照A", "Rime 启动对照 A · 完整依赖"),
    "minimal-deps": ("Rime启动对照B", "Rime 启动对照 B · 极简依赖"),
}

# This exact UI and native presentation path must be identical across both controls.
AB_SURFACE = '''
function StartupABKeyboard() {
  return (
    <VStack spacing={8} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <Text>启动对照：键盘视图已显示</Text>
      <Button title="输入 A（检查可交互）" action={() => CustomKeyboard.insertText("A")} />
    </VStack>
  );
}

function presentStartupAB() {
  try { CustomKeyboard.setToolbarVisible(false); } catch {}
  try { CustomKeyboard.requestHeight(260); } catch {}
  CustomKeyboard.present(<StartupABKeyboard />);
}

presentStartupAB();
'''

INDEX = '''import { Navigation, Script, Text } from "scripting";

void (async () => {
  await Navigation.present(<Text>请在任意文本框切换至本测试键盘，观察首次转圈。</Text>);
  Script.exit();
})();
'''


def keyboard_full_deps(source: str) -> str:
    anchor = "function main() {"
    assert source.count(anchor) == 1
    prefix, old_entry = source.split(anchor, 1)
    assert old_entry.rstrip().endswith("main();")
    assert "function KeyboardRoot(" in prefix
    assert 'import {\n  GeometryReader,' in prefix
    prefix = prefix.replace('import {\n  GeometryReader,', 'import {\n  Button,\n  GeometryReader,', 1)
    # Keeps the original root reachable to bundlers that perform dead-code
    # elimination. This test flag is absent in ordinary Scripting runtimes;
    # it NEVER presents the original root or calls Rime setup.
    keep_graph = '''
// Keep the full original keyboard dependency graph statically reachable.
// This optional property is deliberately not set by either test keyboard.
if ((globalThis as any).__RIME_AB_REFERENCE_FULL_ROOT__ === true) {
  (globalThis as any).__RIME_AB_REFERENCE_RESULT__ = KeyboardRoot;
}
'''
    return prefix + keep_graph + AB_SURFACE


def keyboard_minimal_deps() -> str:
    return 'import { Button, Text, VStack } from "scripting";\n' + AB_SURFACE


def build() -> list[dict[str, object]]:
    source = source_files()
    assert "keyboard.tsx" in source and "keyboard/main.tsx" not in source
    manifest_original = json.loads(source["script.json"])
    assert manifest_original["version"] == "0.3.44"
    assert manifest_original.get("remoteResource") is None

    full = keyboard_full_deps(source["keyboard.tsx"].decode("utf-8"))
    minimal = keyboard_minimal_deps()
    assert full.endswith(AB_SURFACE) and minimal.endswith(AB_SURFACE)
    results: list[dict[str, object]] = []
    for variant in ("full-deps", "minimal-deps"):
        folder, label = PROJECTS[variant]
        files = dict(source) if variant == "full-deps" else {}
        files["keyboard.tsx"] = (full if variant == "full-deps" else minimal).encode("utf-8")
        files["index.tsx"] = INDEX.encode("utf-8")
        manifest = dict(manifest_original)
        manifest["remoteResource"] = None  # Frozen one-time A/B control.
        files["script.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
        result = write_package(files, folder, label, VERSION, OUT_NAMES[variant],
                               english_name="Rime Startup Control " + ("A" if variant == "full-deps" else "B"))
        result["variant"] = variant
        result["keyboard_sha256"] = hashlib.sha256(files["keyboard.tsx"]).hexdigest()
        result["source_files"] = len(files)
        results.append(result)
    (OUT / "startup-ab-manifest.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return results


if __name__ == "__main__":
    build()
