#!/usr/bin/env python3
"""Verify every extracted entry of isolated diagnostic package against source."""
from __future__ import annotations
import hashlib
import json
import zipfile
from pathlib import Path
from create_perf_preview import OUT, source_files, official_files
from create_startup_diagnostic_preview import (FILENAME, PROJECT, REMOTE_ARCHIVE_NAME, REMOTE_ARCHIVE_URL, AUTO_UPDATE_INTERVAL)


def verify():
    info = json.loads((OUT / "startup-manifest.json").read_text())
    target = OUT / FILENAME
    source = source_files()
    assert Path(info["path"]) == target
    assert info["project_name"] == PROJECT and info["version"] == "0.3.46"
    # Auto-update MUST fetch the mutable test branch, never an immutable Git SHA.
    assert REMOTE_ARCHIVE_URL.endswith("/" + REMOTE_ARCHIVE_NAME)
    assert "/refs/heads/perf/rime-startup-trace/" in REMOTE_ARCHIVE_URL
    assert AUTO_UPDATE_INTERVAL == 3600
    archive_alias = OUT / REMOTE_ARCHIVE_NAME
    assert archive_alias.read_bytes() == target.read_bytes()
    assert info["size_bytes"] == target.stat().st_size
    assert info["sha256"] == hashlib.sha256(target.read_bytes()).hexdigest()
    assert len(source) == info["entries"]

    official = official_files()
    for path in (
        "keyboard/components/CandidateBar.tsx",
        "core/rime/T9BridgeAsset.ts",
        "keyboard/input/TouchIntentMachine.ts",
    ):
        assert official[path] == source[path], "Frozen behavior changed: " + path

    with zipfile.ZipFile(target) as archive:
        names = archive.namelist()
        assert len(names) == len(source) == info["entries"]
        assert set(names) == {PROJECT + "/" + path for path in source}
        for relative, expected in source.items():
            actual = archive.read(PROJECT + "/" + relative)
            if relative == "script.json":
                data = json.loads(actual)
                baseline = json.loads(expected)
                assert data["name"] == PROJECT and data["version"] == "0.3.46"
                assert data["remoteResource"] == {
                    "url": REMOTE_ARCHIVE_URL,
                    "autoUpdateInterval": AUTO_UPDATE_INTERVAL
                }
                assert baseline.get("remoteResource") is None
                assert data["localizedNames"]["en"] == "Rime Startup Diagnostics Test"
                assert data["entry"] == baseline["entry"]
                for key in ("name", "version", "localizedNames", "remoteResource"):
                    data.pop(key, None)
                    baseline.pop(key, None)
                assert data == baseline
            else:
                assert actual == expected, "Mismatch: " + relative
        assert not any("/docs/" in name or "/tests/" in name for name in names)
    print("STARTUP_TRACE_PACKAGE_SOURCE_MATCH_PASS", len(source), info["sha256"])


if __name__ == "__main__":
    verify()
