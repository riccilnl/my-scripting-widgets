# Frozen 0.1.0 startup-chain A/B

Rime-startup-ab-full-deps-0.1.0.scripting is control A:
full 0.3.57 static Rime dependency graph, but minimal UI / no Rime setup.
Rime-startup-ab-minimal-deps-0.1.0.scripting is control B:
just three files, no Rime imports, the same minimal UI.
Both have an input A button and match the native toolbar and height
presentation calls. Neither modifies the existing Rime keyboard.

UPDATED iPhone video findings (2026-10-15): A, B and full Rime ALL
show a short Scripting keyboard loading spinner. Wanxiang updater
ALSO shows a spinner, but the user observed it ends much sooner:
the script UI is already visible as the keyboard opens fully.
Prior claims of zero spinner for A or Wanxiang were inaccurate.

These are historical frozen installers (no auto-update). Do not
repeat the obsolete script-internal A-B-B-A switching experiment.
The valid measure is time from EXTERNAL system keyboard activation
into Scripting to first visible frame and first usable input.
No iPhone first-frame measurement can be inferred from JS marks.
Static imports may be optimized by the Scripting runtime.
See scripts/rime输入法/docs/STARTUP_FIRST_FRAME_BASELINE_2026-10-15.md.
