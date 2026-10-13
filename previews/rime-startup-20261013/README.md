# Rime startup diagnostics preview

Install the independent Scripting project Rime启动诊断测试 (0.3.46 preview).
Its script.json remoteResource points to the stable
Rime-startup-trace-latest.zip on this test branch.
Auto-update checks are configured at 3600 seconds; Scripting decides
when checks actually run, not guaranteed background delivery.
Reimport 0.3.46 ONCE if you previously installed a 0.3.45 preview
without the remoteResource setting. Future builds must bump version.
Open its settings -> 性能诊断 -> 启用启动诊断.
Dismiss and reopen the keyboard, then refresh this page.

Records only Rime startup phase names, elapsed times, layout and success/failure/cancel.
It never records text, candidates, paths or full schema identifiers.
Default OFF; only the most recent startup is persisted.
The displayed "present.return" does NOT mean the UI frame became visible.
This package may share Rime dictionaries, schemas and App Group data with
the official keyboard. Avoid schema deployment/update while testing.

Official main 0.3.44 and the earlier A/B packages are unchanged.
