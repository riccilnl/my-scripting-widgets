#!/usr/bin/env python3
"""Check the OTA diagnostics 0.3.59 archive and pinned compatibility URLs.

This is deliberately separate from the one-off independent experiment,
because the user's existing iPhone project follows the diagnostics OTA channel.
"""
from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

from create_perf_preview import OUT, source_files, official_files
from create_compiler_payload_preview import (
    ASSET, RUNTIME, TS_ASSET, transform
)
from create_startup_diagnostic_preview import (
    AUTO_UPDATE_INTERVAL, FILENAME, PROJECT,
    REMOTE_ARCHIVE_NAME, REMOTE_ARCHIVE_URL
)

VERSION = "0.3.59"
FROZEN_PREVIOUS_ARCHIVES = {
    "0.3.57": "5fea010126cc97eda89cb1ba376d83b93dad636d29be33fe4554e7246e5ce97f",
    "0.3.58": "5725c42b3e9ae1157772ac6a527a072908eda7f7e808456d731093d26deb065c",
}


def verify() -> None:
    info = json.loads((OUT / "startup-manifest.json").read_text())
    target = OUT / FILENAME
    source, payload_audit = transform()
    raw_source = source_files()
    assert Path(info["path"]) == target
    assert info["project_name"] == PROJECT
    assert info["version"] == VERSION
    assert info["payload_audit"] == payload_audit
    assert REMOTE_ARCHIVE_URL.endswith("/" + REMOTE_ARCHIVE_NAME)
    assert "/refs/heads/perf/rime-startup-trace/" in REMOTE_ARCHIVE_URL
    assert AUTO_UPDATE_INTERVAL == 3600
    archive_alias = OUT / REMOTE_ARCHIVE_NAME
    assert archive_alias.read_bytes() == target.read_bytes()
    assert info["size_bytes"] == target.stat().st_size
    assert info["sha256"] == hashlib.sha256(target.read_bytes()).hexdigest()
    assert len(source) == info["entries"] == len(raw_source) == 88
    assert "keyboard.tsx" in source and "keyboard/main.tsx" not in source
    assert source["keyboard.tsx"] == raw_source["keyboard.tsx"]
    assert b"CustomKeyboard.present(" in source["keyboard.tsx"]
    assert b'import "./keyboard/main"' not in source["keyboard.tsx"]
    assert TS_ASSET in raw_source and TS_ASSET not in source
    assert ASSET not in raw_source and ASSET in source
    assert source[ASSET].startswith(b"local kAccepted")
    assert b"T9BridgeAsset" not in source[RUNTIME]
    assert b"t9_bridge.lua" in source[RUNTIME]
    assert hashlib.sha256(source[ASSET]).hexdigest() == payload_audit["frozen_lua_sha256"]

    # Original frozen historical behavior must be present outside the
    # archive-only payload transformation. The live source is not rewritten.
    official = official_files()
    for relative in (
        "keyboard/components/CandidateBar.tsx",
        "keyboard/toolbar/ToolbarStrip.tsx",
        "keyboard/components/T9PinyinColumn.tsx",
        "core/rime/T9BridgeAsset.ts",
        "keyboard/input/TouchIntentMachine.ts",
    ):
        assert official[relative] == raw_source[relative], "Frozen behavior changed: " + relative

    with zipfile.ZipFile(target) as archive:
        names = archive.namelist()
        assert len(names) == len(source)
        assert set(names) == {PROJECT + "/" + name for name in source}
        for relative, expected in source.items():
            actual = archive.read(PROJECT + "/" + relative)
            if relative == "script.json":
                data = json.loads(actual)
                baseline = json.loads(expected)
                assert data["name"] == PROJECT and data["version"] == VERSION
                assert data["remoteResource"] == {
                    "url": REMOTE_ARCHIVE_URL,
                    "autoUpdateInterval": AUTO_UPDATE_INTERVAL
                }
                assert baseline["remoteResource"] is None
                assert data["author"]["name"] == "Ricci"
                assert baseline["author"]["name"] == "Ricci"
                assert data["localizedNames"]["en"] == "Rime Startup Diagnostics Test"
                assert data["entry"] == baseline["entry"] == "index.tsx"
                for key in ("name", "version", "localizedNames", "remoteResource"):
                    data.pop(key, None)
                    baseline.pop(key, None)
                assert data == baseline
            else:
                assert actual == expected, "Mismatch: " + relative

        assert not any("/docs/" in name or "/tests/" in name for name in names)

    # Historical versioned archives are immutable while latest.zip and the
    # original pinned 0.3.46 compatibility URL track each preview release.
    for version, expected_sha in FROZEN_PREVIOUS_ARCHIVES.items():
        old_path = (Path(__file__).resolve().parents[3] /
            f"previews/rime-startup-20261013/Rime-startup-trace-{version}-preview.scripting")
        assert old_path.is_file(), old_path
        assert hashlib.sha256(old_path.read_bytes()).hexdigest() == expected_sha
        assert expected_sha != info["sha256"]
        print("STARTUP_TRACE_FROZEN_PASS", version, expected_sha)
    print("STARTUP_TRACE_039_SOURCE_PASS", len(source), info["sha256"])


if __name__ == "__main__":
    verify()
