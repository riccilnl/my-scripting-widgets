#!/usr/bin/env python3
"""Verify A/B archives by extracted file bytes, never compressed ZIP bytes.

Different Python/zlib versions may produce different valid ZIP byte streams.
The archive and its source manifest are validated before publishing SHA256SUMS.
"""
from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

from create_perf_preview import OUT, official_files, source_files

PINNED_RELEASE = "56125d2"
FOLDERS = {
    "Rime-baseline-0.3.44.scripting": ("Rime基线测试", "0.3.44", official_files),
    "Rime-performance-0.3.45-preview.scripting": ("Rime性能测试", "0.3.45", source_files),
}


def verify() -> dict:
    manifest = json.loads((OUT / "manifest.json").read_text())
    assert manifest["release_head"] == PINNED_RELEASE, "Official baseline changed"
    assert len(manifest["packages"]) == len(FOLDERS), "Expected two preview packages"

    official = official_files()
    current = source_files()
    expected_diff = sorted(
        k for k in set(official) | set(current) if official.get(k) != current.get(k)
    )
    assert manifest["changed_runtime_files"] == expected_diff, "Source diff mismatch"
    assert len(expected_diff) == 8, f"Unexpected changed runtime files: {expected_diff}"
    assert official["keyboard/components/CandidateBar.tsx"] == current["keyboard/components/CandidateBar.tsx"], "Frozen candidate tap layout changed"
    assert official["core/rime/T9BridgeAsset.ts"] == current["core/rime/T9BridgeAsset.ts"], "Frozen T9 Lua changed"

    seen = set()
    for item in manifest["packages"]:
        archive_path = Path(item["path"])
        assert archive_path.parent == OUT, f"Unexpected archive path: {archive_path}"
        filename = archive_path.name
        assert filename in FOLDERS and filename not in seen, filename
        seen.add(filename)
        project, version, source = FOLDERS[filename]
        expected = official if filename.startswith("Rime-baseline-") else current
        assert item["project_name"] == project and item["version"] == version

        raw = archive_path.read_bytes()
        assert item["size_bytes"] == len(raw)
        assert item["sha256"] == hashlib.sha256(raw).hexdigest(), filename
        with zipfile.ZipFile(archive_path) as archive:
            entries = [name for name in archive.namelist() if not name.endswith("/")]
            assert len(entries) == item["entries"] == len(expected) == 82, filename
            assert all(name.startswith(project + "/") for name in entries), filename
            relative = [name[len(project) + 1:] for name in entries]
            assert len(relative) == len(set(relative)), "Duplicate ZIP paths"
            assert set(relative) == set(expected), "Missing/added ZIP entries"
            for name, rel in zip(entries, relative):
                contents = archive.read(name)
                if rel != "script.json":
                    assert contents == expected[rel], f"Altered {filename}: {rel}"
                else:
                    app = json.loads(contents)
                    reference = json.loads(expected[rel])
                    assert app["name"] == project
                    assert app["version"] == version
                    assert app.get("entry") == reference.get("entry")
                    assert app.get("localizedNames", {}).get("zh") in {
                        "Rime 基线对照", "Rime 性能测试"
                    }
                    for key in ("name", "version", "localizedNames"):
                        app.pop(key, None)
                        reference.pop(key, None)
                    assert app == reference, "Unexpected script manifest mutation"
    assert seen == set(FOLDERS), "Missing package"
    print("PERF_ARCHIVES_EXTRACTED_SOURCE_BYTES_PASS", len(official), "entries",
          len(expected_diff), "changed runtime files")
    for item in manifest["packages"]:
        print(item["project_name"], item["version"], item["sha256"])
    return manifest


if __name__ == "__main__":
    verify()
