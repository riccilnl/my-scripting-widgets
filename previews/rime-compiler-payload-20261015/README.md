# Compiler payload experiment 0.3.58

Independent frozen test keyboard with the ORIGINAL keyboard.tsx.
The T9 Lua source was moved out of the eager TS static import graph
into an identically-versioned package file. The verified normal
T9 fast path never reads the packaged asset; stale repair does.

Eager TS sources: baseline 60 modules / 270321 bytes;
this experiment 59 modules / 245562 bytes (-24759, 9.16%).
Those figures are source sizes, NOT iPhone compile timings.

Test external-keyboard activation to Scripting, first frame,
typing, 26-key and T9. Asset read compatibility and any startup
improvement remain UNVERIFIED on a real iPhone. No auto-update.
Never replace the original keyboard or 0.3.57 latest URL.
See scripts/rime输入法/docs/COMPILER_PAYLOAD_0.3.58_2026-10-15.md.
