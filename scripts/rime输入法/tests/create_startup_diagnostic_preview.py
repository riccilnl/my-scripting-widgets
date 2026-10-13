#!/usr/bin/env python3
"""Build an independent startup-diagnostics keyboard from current test branch."""
from __future__ import annotations
import json
from pathlib import Path
from create_perf_preview import OUT, source_files, write_package

FILENAME = "Rime-startup-trace-0.3.46-preview.scripting"
REMOTE_ARCHIVE_NAME = "Rime-startup-trace-latest.zip"
REMOTE_ARCHIVE_URL = (
    "https://raw.githubusercontent.com/riccilnl/my-scripting-widgets/"
    "refs/heads/perf/rime-startup-trace/previews/rime-startup-20261013/"
    + REMOTE_ARCHIVE_NAME
)
AUTO_UPDATE_INTERVAL = 3600  # seconds; actual scheduling belongs to iOS Scripting
PROJECT = "Rime启动诊断测试"


def build():
    files = source_files()
    assert "keyboard/runtime/StartupTrace.ts" in files
    assert "ui/settings/StartupDiagnosticsPage.tsx" in files
    metadata = json.loads(files["script.json"])
    assert metadata["version"] == "0.3.44"
    assert metadata.get("remoteResource") is None
    # Only the independent test archive subscribes to updates.
    # Keep the source manifest and official 0.3.44 unchanged.
    metadata["remoteResource"] = {
        "url": REMOTE_ARCHIVE_URL,
        "autoUpdateInterval": AUTO_UPDATE_INTERVAL
    }
    files["script.json"] = (json.dumps(metadata, ensure_ascii=False, indent=2) + "\n").encode()
    item = write_package(files, PROJECT, "Rime 启动诊断测试", "0.3.46", FILENAME,
                         english_name="Rime Startup Diagnostics Test")
    # A stable .zip URL is explicitly supported by the official remote-resource API.
    # .scripting and .zip contain identical ZIP bytes for predictable validation.
    import shutil
    shutil.copyfile(OUT / FILENAME, OUT / REMOTE_ARCHIVE_NAME)
    assert (OUT / REMOTE_ARCHIVE_NAME).read_bytes() == (OUT / FILENAME).read_bytes()
    (OUT / "startup-manifest.json").write_text(json.dumps(item, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(item, ensure_ascii=False, indent=2))
    return item


if __name__ == "__main__":
    build()
