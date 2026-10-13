#!/usr/bin/env python3
"""Build isolated LazyVGrid vs VStack/HStack keyboards; never touch installed releases."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import zipfile

from create_perf_preview import OUT, REPO, write_package

VERSION = "0.3.54"
PINNED_PACKAGE = REPO / "previews/rime-startup-20261013/Rime-startup-trace-0.3.53-preview.scripting"
PINNED_SHA256 = "12da34808f629ab53a64108dc9ffb18602eb5c25f03db3927fb6a3e695afccc0"
PINNED_ROOT = "Rime启动诊断测试/"
PANEL = "keyboard/components/ExpandedCandidatePanel.tsx"
NON_LAZY = Path(__file__).parent / "lazy_ab" / "ExpandedCandidatePanelNonLazy.tsx"
FOLDERS = {
    "lazy": ("Rime冷启动Lazy组", "Rime 冷启动 Lazy 组", "Rime Startup Lazy Control",
             "Rime-startup-lazy-0.3.54.scripting"),
    "plain": ("Rime冷启动普通组", "Rime 冷启动普通组", "Rime Startup Plain Stack",
              "Rime-startup-plain-0.3.54.scripting"),
}


def build_sources() -> dict[str, dict[str, bytes]]:
    # Immutable A/B baseline: the already published and hashed 0.3.53 build.
    # Later development on this branch must not silently mutate v0.3.54 A/B.
    content = PINNED_PACKAGE.read_bytes()
    assert hashlib.sha256(content).hexdigest() == PINNED_SHA256, "Pinned 0.3.53 artifact changed"
    with zipfile.ZipFile(PINNED_PACKAGE) as archive:
        names = archive.namelist()
        assert names and all(path.startswith(PINNED_ROOT) for path in names)
        origin = {path[len(PINNED_ROOT):]: archive.read(path) for path in names}
    metadata = json.loads(origin["script.json"])
    assert metadata["version"] == "0.3.53", "Wrong pinned preview manifest"
    assert metadata["remoteResource"]["url"].endswith("Rime-startup-trace-latest.zip")
    metadata["remoteResource"] = None
    assert "LazyVGrid" in origin[PANEL].decode()
    assert b"rime.session.native.begin" in origin["keyboard/runtime/RimeRuntimeCoordinator.ts"]
    assert b"candidateExpanded, setCandidateExpanded" in origin["keyboard/main.tsx"]
    assert b"useState(false)" in origin["keyboard/main.tsx"]

    # Both test projects use identical metadata except their installed display
    # name. Disable subscription: these A/B snapshots must not overwrite the
    # stable diagnostics preview's latest.zip automatic update.
    metadata["author"]["name"] = "Ricci"
    baseline = dict(origin)
    baseline["script.json"] = (json.dumps(metadata, ensure_ascii=False, indent=2) + "\n").encode()

    alt_panel = NON_LAZY.read_bytes()
    assert b"LazyVGrid" not in alt_panel and b"LazyVStack" not in alt_panel
    assert b"scrollTargetLayout" in alt_panel
    assert b"onScrollTargetVisibilityChange" in alt_panel
    assert b"onSelect(entry.originalIndex)" in alt_panel
    alternate = dict(baseline)
    alternate[PANEL] = alt_panel
    assert [k for k in baseline if baseline[k] != alternate[k]] == [PANEL]
    return {"lazy": baseline, "plain": alternate}


def build() -> None:
    sources = build_sources()
    outputs = []
    for cohort, (project, chinese, english, filename) in FOLDERS.items():
        outputs.append(write_package(sources[cohort], project, chinese, VERSION,
                                     filename, english_name=english))
    (OUT / "lazy-ab-manifest.json").write_text(
        json.dumps({"version": VERSION, "packages": outputs,
                    "changed_runtime_paths": [PANEL],
                    "automatic_update": False,
                    "frozen_baseline_sha256": PINNED_SHA256}, ensure_ascii=False, indent=2) + "\n"
    )
    print("LAZY_AB_PACKAGE_BUILD_PASS", len(outputs), VERSION)


if __name__ == "__main__":
    build()
