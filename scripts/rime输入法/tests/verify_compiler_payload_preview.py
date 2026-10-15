#!/usr/bin/env python3
"""Package invariants for the archive-only compile-load experiment."""
from __future__ import annotations

import hashlib
import json
import zipfile

from create_perf_preview import OUT, source_files
from create_compiler_payload_preview import (
    ASSET, FILENAME, OLD_IMPORT, OLD_CODE, NEW_CODE, PROJECT,
    RUNTIME, TS_ASSET, VERSION, transform,
)


def verify() -> None:
    original = source_files()
    files, audit = transform()
    item = json.loads((OUT / "compiler-payload-manifest.json").read_text())
    pkg = OUT / FILENAME
    assert item["path"] == str(pkg)
    assert item["sha256"] == hashlib.sha256(pkg.read_bytes()).hexdigest()
    assert item["audit"] == audit and item["version"] == VERSION
    assert item["entries"] == len(files) == len(original)
    assert TS_ASSET not in files and ASSET not in original
    assert len(files[ASSET]) >= 24000 and files[ASSET].endswith(b"\n")
    assert files[ASSET].startswith(b"local kAccepted")
    assert OLD_IMPORT.encode() not in files[RUNTIME]
    assert OLD_CODE.encode() not in files[RUNTIME]
    assert NEW_CODE.encode() in files[RUNTIME]
    assert b'T9BridgeAsset' not in files[RUNTIME]
    assert files["keyboard.tsx"] == original["keyboard.tsx"]
    assert files["index.tsx"] == original["index.tsx"]
    for name in sorted(original):
        if name in (TS_ASSET, RUNTIME, "script.json"):
            continue
        assert files[name] == original[name], name

    with zipfile.ZipFile(pkg) as archive:
        assert set(archive.namelist()) == {PROJECT + "/" + name for name in files}
        for name, payload in files.items():
            stored = archive.read(PROJECT + "/" + name)
            if name == "script.json":
                meta, exp = json.loads(stored), json.loads(payload)
                assert meta["name"] == PROJECT and meta["version"] == VERSION
                assert meta["remoteResource"] is None and meta["author"]["name"] == "Ricci"
                assert meta["entry"] == "index.tsx"
                for field in ("name", "version", "localizedNames"):
                    meta[field] = exp[field]
                assert meta == exp
            else:
                assert stored == payload, name
    assert hashlib.sha256(files[ASSET]).hexdigest() == audit["frozen_lua_sha256"]
    print("COMPILER_ASSET_SOURCE_INTEGRITY_PASS", len(original), audit["eliminated_ts_bytes"])
    print("COMPILER_ASSET_PACKAGE_PASS", item["sha256"])


if __name__ == "__main__":
    verify()
