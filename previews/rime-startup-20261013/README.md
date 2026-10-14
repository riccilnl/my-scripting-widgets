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

This preview isolates candidate-bar subscriptions from full keyboard
state changes (Rime candidate text and highlight only). The frozen
original CandidateBar touch geometry, nine-key Lua, and Rime
initialization order are unchanged. Check 26-key and T9 candidate
selection, highlighted space-swipe gestures, and expanded scrolling.

Records only Rime startup phase names, elapsed times, layout and success/failure/cancel.
It never records text, candidates, paths or full schema identifiers.
Default OFF; only the most recent startup is persisted.
The displayed "present.return" does NOT mean the UI frame became visible.
This package may share Rime dictionaries, schemas and App Group data with
the official keyboard. Avoid schema deployment/update while testing.

Official main 0.3.52 is unchanged.
