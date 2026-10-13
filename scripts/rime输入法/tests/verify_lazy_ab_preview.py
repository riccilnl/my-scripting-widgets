#!/usr/bin/env python3
"""Verify A/B snapshots by extracted files; permit exactly one source-code difference."""
from __future__ import annotations
import hashlib
import json
import zipfile

from create_perf_preview import OUT
from create_lazy_ab_preview import FOLDERS, PANEL, PINNED_SHA256, VERSION, build_sources


def verify() -> None:
    metadata = json.loads((OUT / "lazy-ab-manifest.json").read_text())
    assert metadata["version"] == VERSION
    assert metadata["automatic_update"] is False
    assert metadata["frozen_baseline_sha256"] == PINNED_SHA256
    assert metadata["changed_runtime_paths"] == [PANEL]
    assert len(metadata["packages"]) == len(FOLDERS)
    sources = build_sources()
    decoded: dict[str, dict[str, bytes]] = {}
    for cohort, (project, label, english, filename) in FOLDERS.items():
        expected = sources[cohort]
        archive_path = OUT / filename
        raw = archive_path.read_bytes()
        record = next(x for x in metadata["packages"] if x["project_name"] == project)
        assert record["path"] == str(archive_path)
        assert record["version"] == VERSION and record["size_bytes"] == len(raw)
        assert record["sha256"] == hashlib.sha256(raw).hexdigest()
        with zipfile.ZipFile(archive_path) as archive:
            entries = archive.namelist()
            assert len(entries) == len(expected) == record["entries"]
            assert set(entries) == {project + "/" + p for p in expected}
            data = {p: archive.read(project + "/" + p) for p in expected}
            for rel in expected:
                if rel != "script.json":
                    assert data[rel] == expected[rel], "Unexpected build modification: " + rel
            app = json.loads(data["script.json"])
            original = json.loads(expected["script.json"])
            assert app["version"] == VERSION
            assert app["author"]["name"] == "Ricci"
            assert app["name"] == project
            assert app["localizedNames"]["zh"] == label
            assert app["localizedNames"]["en"] == english
            assert app["remoteResource"] is None
            assert app["entry"] == original["entry"]
            for key in ("version", "name", "localizedNames"):
                app.pop(key, None)
                original.pop(key, None)
            assert app == original
            assert not any("/tests/" in p or "/docs/" in p for p in entries)
            decoded[cohort] = {path: data[path] for path in data if path != "script.json"}
    delta = sorted(path for path in decoded["lazy"]
                   if decoded["lazy"][path] != decoded["plain"][path])
    assert delta == [PANEL], delta
    assert b"LazyVGrid" in decoded["lazy"][PANEL]
    assert b"LazyVGrid" not in decoded["plain"][PANEL]
    for path in ("keyboard/main.tsx", "keyboard/runtime/RimeRuntimeCoordinator.ts",
                 "keyboard/runtime/StartupTrace.ts", "core/rime/RimeEngine.ts",
                 "keyboard/components/AuxiliarySurfaceHost.tsx"):
        assert decoded["lazy"][path] == decoded["plain"][path], path
    print("LAZY_AB_EXACTLY_ONE_RUNTIME_FILE_DIFF_PASS", PANEL)
    for item in metadata["packages"]:
        print(item["project_name"], item["version"], item["sha256"])


if __name__ == "__main__":
    verify()
