#!/usr/bin/env python3
"""Build an independent startup-diagnostics keyboard from current test branch."""
from __future__ import annotations
import json
from pathlib import Path
from create_perf_preview import OUT, source_files, write_package

FILENAME = "Rime-startup-trace-0.3.45-preview.scripting"
PROJECT = "Rime启动诊断测试"


def build():
    files = source_files()
    assert "keyboard/runtime/StartupTrace.ts" in files
    assert "ui/settings/StartupDiagnosticsPage.tsx" in files
    assert json.loads(files["script.json"])["version"] == "0.3.44"
    item = write_package(files, PROJECT, "Rime 启动诊断测试", "0.3.45", FILENAME,
                         english_name="Rime Startup Diagnostics Test")
    (OUT / "startup-manifest.json").write_text(json.dumps(item, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(item, ensure_ascii=False, indent=2))
    return item


if __name__ == "__main__":
    build()
