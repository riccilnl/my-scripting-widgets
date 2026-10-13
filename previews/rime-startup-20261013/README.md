# Rime startup diagnostics preview

Install/update Rime启动诊断测试 ONLY from this stable ZIP URL:
https://raw.githubusercontent.com/riccilnl/my-scripting-widgets/refs/heads/perf/rime-startup-trace/previews/rime-startup-20261013/Rime-startup-trace-latest.zip

WARNING: The Scripting importer may persist the address that was
actually imported into remoteResource.url, overriding the manifest.
Never give users a versioned .scripting or immutable commit link as
the recommended auto-update installation URL.
Versioned .scripting assets are release snapshots, not subscriptions.
Each future release MUST increment the version while retaining the
stable latest.zip URL. Interval 3600 seconds controls app-side checks.
Open its settings -> 性能诊断 -> 启用启动诊断.
Dismiss and reopen the keyboard, then refresh this page.

Records only Rime startup phase names, elapsed times, layout and success/failure/cancel.
It never records text, candidates, paths or full schema identifiers.
Default OFF; only the most recent startup is persisted.
The displayed "present.return" does NOT mean the UI frame became visible.
This package may share Rime dictionaries, schemas and App Group data with
the official keyboard. Avoid schema deployment/update while testing.

Official main 0.3.44 and the earlier A/B packages are unchanged.
