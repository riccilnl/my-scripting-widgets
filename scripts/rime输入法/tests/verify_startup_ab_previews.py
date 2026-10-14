#!/usr/bin/env python3
"""Source and behavioral contracts for Rime startup A/B control installers."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import zipfile

from create_perf_preview import OUT, source_files
from create_startup_ab_previews import (AB_SURFACE, INDEX, OUT_NAMES,
                                        PROJECTS, VERSION, keyboard_full_deps,
                                        keyboard_minimal_deps)


def verify() -> None:
    original = source_files()
    manifest = json.loads((OUT / "startup-ab-manifest.json").read_text())
    assert len(manifest) == 2
    full_entry = keyboard_full_deps(original["keyboard.tsx"].decode("utf-8")).encode()
    min_entry = keyboard_minimal_deps().encode()
    assert full_entry != min_entry
    assert full_entry.decode().endswith(AB_SURFACE)
    assert min_entry.decode().endswith(AB_SURFACE)
    assert full_entry.count(b"CustomKeyboard.present(") == 1
    assert min_entry.count(b"CustomKeyboard.present(") == 1
    assert b"function KeyboardRoot(" in full_entry and b"function KeyboardRoot(" not in min_entry
    assert b"__RIME_AB_REFERENCE_FULL_ROOT__" in full_entry
    assert b"import { Button, Text, VStack } from \"scripting\";" in min_entry
    assert b"Rime" not in min_entry
    assert b"Rime.setup(" not in min_entry
    assert b"prepareKeyboardRimeRuntime(" in full_entry  # Present but not called.
    assert b"presentStartupAB();" in full_entry and b"presentStartupAB();" in min_entry

    for item, variant in zip(manifest, ("full-deps", "minimal-deps")):
        folder, label = PROJECTS[variant]
        pkg = OUT / OUT_NAMES[variant]
        assert item["variant"] == variant
        assert item["path"] == str(pkg)
        assert item["version"] == VERSION
        assert item["size_bytes"] == pkg.stat().st_size
        assert item["sha256"] == hashlib.sha256(pkg.read_bytes()).hexdigest()
        expected = dict(original) if variant == "full-deps" else {}
        expected["keyboard.tsx"] = full_entry if variant == "full-deps" else min_entry
        expected["index.tsx"] = INDEX.encode()
        source_manifest = json.loads(original["script.json"])
        source_manifest["remoteResource"] = None
        # write_package only changes name/version/localizedNames.
        source_manifest["name"] = folder
        source_manifest["version"] = VERSION
        source_manifest.setdefault("localizedNames", {})["zh"] = label
        source_manifest["localizedNames"]["en"] = (
            "Rime Startup Control A" if variant == "full-deps" else "Rime Startup Control B"
        )
        expected["script.json"] = (json.dumps(source_manifest, ensure_ascii=False, indent=2)+"\n").encode()
        assert item["source_files"] == len(expected)
        assert (len(expected) > 50) if variant == "full-deps" else (len(expected) == 3)
        with zipfile.ZipFile(pkg) as archive:
            names = archive.namelist()
            assert len(names) == len(expected)
            assert set(names) == {folder + "/" + p for p in expected}
            for rel, data in expected.items():
                assert archive.read(folder + "/" + rel) == data, (variant, rel)
            meta = json.loads(archive.read(folder + "/script.json"))
            assert meta["remoteResource"] is None
            assert meta["entry"] == "index.tsx"
            assert meta["version"] == VERSION
            assert meta["name"] == folder
        print("STARTUP_AB_PACKAGE_PASS", variant, len(expected), item["sha256"])
    print("STARTUP_AB_INVARIANTS_PASS")


if __name__ == "__main__":
    verify()
