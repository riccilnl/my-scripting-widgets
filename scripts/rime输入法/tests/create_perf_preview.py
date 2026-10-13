#!/usr/bin/env python3
"""Create two independent Scripting keyboard-install archives without touching main.
All files stay under the repository's .git/perf-preview directory.
"""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
import subprocess
import zipfile

REPO = Path(__file__).resolve().parents[3]
SOURCE = REPO / "scripts" / "rime输入法"
OUT = REPO / ".git" / "perf-preview"
ROOT = "rime输入法"
RELEASE_SHA = "56125d2c1d481dcb65c83f7f447cb590641a2ec5"
IGNORE = {"docs", "tests", ".cora", ".colameta", ".git", "node_modules", ".vscode", ".idea"}
IGNORE_FILES = {".DS_Store"}


def source_files() -> dict[str, bytes]:
    result = {}
    for f in SOURCE.rglob("*"):
        if not f.is_file():
            continue
        rel = f.relative_to(SOURCE)
        if any(part in IGNORE for part in rel.parts) or f.name in IGNORE_FILES:
            continue
        result[rel.as_posix()] = f.read_bytes()
    return result


def official_files() -> dict[str, bytes]:
    data = subprocess.check_output(
        ["git", "show", RELEASE_SHA + ":rime输入法.scripting"], cwd=REPO
    )
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        members = {}
        for name in archive.namelist():
            if name.endswith("/"):
                continue
            if not name.startswith(ROOT + "/"):
                raise ValueError("Unexpected baseline archive root: " + name)
            rel = name[len(ROOT) + 1:]
            if rel in members:
                raise ValueError("Duplicate official path: " + rel)
            members[rel] = archive.read(name)
        return members


def write_package(source: dict[str, bytes], folder: str, label: str,
                  version: str, filename: str,
                  english_name: str | None = None) -> dict[str, object]:
    files = dict(source)
    manifest = json.loads(files["script.json"])
    manifest["name"] = folder
    manifest["version"] = version
    manifest.setdefault("localizedNames", {})["zh"] = label
    manifest["localizedNames"]["en"] = (english_name if english_name is not None
        else "Rime Baseline Test" if "基线" in folder else "Rime Performance Test")
    files["script.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    if not files.get(manifest["entry"]):
        raise AssertionError("Entry missing from test package")

    target = OUT / filename
    OUT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for rel, data in sorted(files.items()):
            if any(part in IGNORE for part in Path(rel).parts):
                raise AssertionError("Development file in test package: " + rel)
            info = zipfile.ZipInfo(folder + "/" + rel, (2026, 10, 13, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED,
                             compresslevel=6)
    with zipfile.ZipFile(target) as archive:
        assert len(archive.namelist()) == len(files)
        for rel, data in files.items():
            assert archive.read(folder + "/" + rel) == data
    return {
        "path": str(target),
        "project_name": folder,
        "version": version,
        "entries": len(files),
        "size_bytes": target.stat().st_size,
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
    }


def main() -> None:
    subprocess.run(["git", "merge-base", "--is-ancestor", RELEASE_SHA, "HEAD"],
                   cwd=REPO, check=True)
    published = official_files()
    current = source_files()
    assert json.loads(published["script.json"])["version"] == "0.3.44"
    assert json.loads(current["script.json"])["version"] == "0.3.44"
    # Freeze the proven touch layouts independently of runtime performance edits.
    assert published["keyboard/components/CandidateBar.tsx"] == current["keyboard/components/CandidateBar.tsx"]
    assert published["core/rime/T9BridgeAsset.ts"] == current["core/rime/T9BridgeAsset.ts"]
    baseline = write_package(published, "Rime基线测试", "Rime 基线对照",
                             "0.3.44", "Rime-baseline-0.3.44.scripting")
    optimized = write_package(current, "Rime性能测试", "Rime 性能测试",
                              "0.3.45", "Rime-performance-0.3.45-preview.scripting")
    diff = [
        k for k in sorted(set(published) | set(current))
        if published.get(k) != current.get(k)
    ]
    summary = {"release_head": "56125d2", "packages": [baseline, optimized],
               "changed_runtime_files": diff,
               "manifest_modified_only_in_archive": True,
               "official_version_untouched": True}
    (OUT / "manifest.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
