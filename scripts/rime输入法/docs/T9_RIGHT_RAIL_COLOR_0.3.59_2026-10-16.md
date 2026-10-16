# T9 right-rail color alignment · 0.3.59 preview

- Scope: second key below Backspace in the T9 right column (t9-delimiter).
- Before: normal visual role (character-key background).
- After: system visual role, same skin color role as Backspace and Enter unless the theme explicitly overrides an individual key (WeChat Enter remains accent).
- Custom label, command, geometry, hitboxes, press-feedback and all other layouts unchanged.
- Regression tests check the three roles, retained command and central skin color selection.
- Preview 0.3.59 inherits the 0.3.58 compiler-payload packaging; official main remains frozen.
- OTA: mutable latest.zip and pinned old 0.3.46 alias; frozen 0.3.57/0.3.58 snapshots.
- Acceptance: runtime tests, archive verification, workflow CI, then iPhone T9 light/dark appearance and custom-key action. CI cannot establish device acceptance.
