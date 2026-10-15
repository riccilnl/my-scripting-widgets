#!/usr/bin/env python3
"""Static TS compilation surface audit; this is NOT an iOS duration measurement."""
from __future__ import annotations

import json
import posixpath
import re
from pathlib import PurePosixPath

from create_perf_preview import OUT, source_files
from create_compiler_payload_preview import transform

IMPORT = re.compile(r'(?ms)^\s*import\s+(?!type\b)(.*?)\s*;')
FROM = re.compile(r'from\s+["\x27]([^"\x27]+)["\x27]\s*$')
SIDE_EFFECT = re.compile(r'^["\x27]([^"\x27]+)["\x27]$')


def static_graph(files: dict[str, bytes]) -> dict[str, object]:
    modules = {p for p in files if p.endswith((".ts", ".tsx"))}
    assert "keyboard.tsx" in modules
    edges: dict[str, list[str]] = {}
    for rel in sorted(modules):
        code = files[rel].decode("utf-8")
        children = []
        for match in IMPORT.finditer(code):
            declaration = match.group(1).strip()
            m = FROM.search(declaration) or SIDE_EFFECT.search(declaration)
            if m is None or not m.group(1).startswith("."):
                continue
            target = posixpath.normpath(posixpath.join(posixpath.dirname(rel), m.group(1)))
            for candidate in (target + ".tsx", target + ".ts",
                              target + "/index.tsx", target + "/index.ts"):
                if candidate in modules:
                    children.append(candidate)
                    break
            else:
                raise AssertionError(f"Unresolved startup import: {rel} -> {target}")
        edges[rel] = children

    visited = set()
    def visit(module: str) -> None:
        if module in visited:
            return
        visited.add(module)
        for target in edges[module]:
            visit(target)
    visit("keyboard.tsx")
    return {
        "entry_bytes": len(files["keyboard.tsx"]),
        "eager_modules": len(visited),
        "eager_source_bytes": sum(len(files[n]) for n in visited),
        "entry_direct_imports": len(edges["keyboard.tsx"]),
        "largest_sources": [
            {"path": n, "source_bytes": len(files[n])}
            for n in sorted(visited, key=lambda v: len(files[v]), reverse=True)[:8]
        ],
        "eager_paths": sorted(visited)
    }


def audit() -> dict[str, object]:
    original = source_files()
    optimized, _ = transform()
    a = static_graph(original)
    b = static_graph(optimized)
    assert a["entry_bytes"] == b["entry_bytes"]
    assert a["entry_direct_imports"] == b["entry_direct_imports"] == 33
    assert a["eager_modules"] == 60 and b["eager_modules"] == 59
    delta = a["eager_source_bytes"] - b["eager_source_bytes"]
    assert 24000 < delta < 27000, delta
    assert "core/rime/T9BridgeAsset.ts" in a["eager_paths"]
    assert "core/rime/T9BridgeAsset.ts" not in b["eager_paths"]
    assert "core/rime/T9BridgeRuntime.ts" in b["eager_paths"]
    result = {
        "method": "recursive static import scan excluding import type; byte sizes, not iOS compile ms",
        "original": {k: v for k, v in a.items() if k != "eager_paths"},
        "payload": {k: v for k, v in b.items() if k != "eager_paths"},
        "reduced_eager_ts_bytes": delta,
        "eliminated_eager_modules": a["eager_modules"] - b["eager_modules"],
    }
    (OUT / "compiler-graph-audit.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result


if __name__ == "__main__":
    audit()
