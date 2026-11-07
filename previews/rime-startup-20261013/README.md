# Rime startup diagnostics preview

Install/update Rime启动诊断测试 ONLY from this stable ZIP URL:
https://raw.githubusercontent.com/riccilnl/my-scripting-widgets/refs/heads/perf/rime-startup-trace/previews/rime-startup-20261013/Rime-startup-trace-latest.zip

WARNING: The Scripting importer may persist the address that was
actually imported into remoteResource.url, overriding the manifest.
Never give users a versioned .scripting or immutable commit link as
the recommended auto-update installation URL.
The ORIGINAL 0.3.46-preview.scripting URL was pinned on iPhone.
It is now a MUTABLE compatibility alias for latest.zip, NOT a frozen
v0.3.46 snapshot. Keep refreshing BOTH latest.zip and this alias
on EVERY future test release until the phone demonstrably changes.
Other versioned .scripting files remain snapshots; never give them
as auto-update subscription links. Each future test release MUST
increment the manifest version. Interval 3600 seconds is check cadence.
Open its settings -> 性能诊断 -> 启用启动诊断.
Dismiss and reopen the keyboard, then refresh this page.

0.3.63 is the same existing OTA diagnostics preview. The user
reported that 0.3.62 fixed blurred candidates but delayed haptic
bursts persisted. iOS 27.2 diagnostic mode now sends ZERO
script-originated Haptics calls, even if the previous saved setting
was enabled. The feedback toggle is visibly disabled in this
preview; the stored preference is NOT changed. This isolates
native haptics as a potential source, not an accepted fix.
Keyboard input, gesture animations, candidate scrolling, and
approved 0.3.62 blur fix are unchanged. Verification is pending.

0.3.62 also replaces the pooled Core Haptics engine with a
single non-queued native transient (which did NOT resolve delayed
vibrations on the user's iOS 27.2 device), and bounds stalled
clipboard calls to 1200ms so the
normal key-action FIFO resumes without a late paste.
These are preventive source fixes; iOS 27.2 device acceptance
remains pending.

0.3.62 disables the iOS 26+ ScrollView edge blur on the toolbar
and candidate scrolling surfaces, preserving horizontal scrolling,
hit geometry, and the existing OTA URL. No changes to Rime engine,
key heights, overlay stacking, or other keyboard applications.
On-device iOS 27.2 rendering validation is still pending.

0.3.61 updates the EXISTING diagnostics preview (no extra app/branch),
preserving its stable OTA URL and the 0.3.46 pinned compatibility alias.
CandidateBarSubscriber stays mounted even with idle toolbar disabled.
iOS keyboard height is fitted to the actual viewport and top-anchored.
Missing Rime candidates show a status instead of a blank strip.
Scripting TypeScript errors are fixed. Real-device iOS 27.2 verification
remains pending. 0.3.60 and earlier historical snapshots stay frozen.

0.3.60 previously restored T9 pinyin options after partial selection,
retaining Rime-owned Chinese candidates and ranking. Fedora LuaJIT
simulation passed; iPhone Scripting behavior remains unverified.

0.3.59 previously followed the SAME mutable URL as 0.3.58.
The embedded T9 Lua resource moved out of the initial TS import
graph to a packaged file read only when T9 repair is needed.
It is a compiler-load hypothesis, NOT a proven speed improvement.
The previously published 0.3.57 and 0.3.58 snapshots are frozen for rollback.
The installed iPhone may pin a previous versioned download URL;
that 0.3.46 compatibility alias stays synchronized with latest.
An iPhone update and actual T9 first-frame / functionality test are
still required. No automatic change to the official main keyboard.

This preview isolates candidate-bar updates and T9 left-column
pinyin-choice updates from the keyboard root. The original CandidateBar
and T9PinyinColumn touch/scroll geometry, nine-key Lua, and Rime
initialization order are unchanged. Verify Chinese/ASCII T9 switching,
pinyin selection, space swipes, 26-key input and expanded scrolling.

0.3.57 introduced Settings -> 键盘设置 -> 动作与工具栏 ->
显示工具栏（性能对照） switch. As of 0.3.61, off hides only
toolbar buttons; the candidate subscriber remains mounted and
the disabled-toolbar state is visible. Reopen the keyboard
to apply settings. iPhone spinner reduction is unverified.

Records only Rime startup phase names, elapsed times, layout and success/failure/cancel.
It never records text, candidates, paths or full schema identifiers.
Default OFF; only the most recent startup is persisted.
The displayed "present.return" does NOT mean the UI frame became visible.
This package may share Rime dictionaries, schemas and App Group data with
the official keyboard. Avoid schema deployment/update while testing.

0.3.59: T9 right-rail second key shares system background role
with Backspace; its configured command and touch area are unchanged.
Official main is unchanged.
