# Frozen 0.1.0 startup-chain A/B

Rime-startup-ab-full-deps-0.1.0.scripting is control A:
full 0.3.57 static Rime dependency graph, but minimal UI / no Rime setup.
Rime-startup-ab-minimal-deps-0.1.0.scripting is control B:
just three files, no Rime imports, the same minimal UI.
Both have an input A button and match the native toolbar and height
presentation calls. Neither modifies the existing Rime keyboard.

These are frozen installers (no auto-update). Install both separately
and compare A-B-B-A in one text field with the same Low Power Mode.
Five or more trials per variant; compare the full 0.3.57 keyboard.
No iPhone first-frame measurement can be inferred from JS marks.
Static imports may be optimized by the Scripting runtime.
See scripts/rime输入法/docs/STARTUP_AB_CONTROLS_2026-10-14.md.
