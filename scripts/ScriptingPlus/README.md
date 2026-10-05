# ScriptingPlus 1.4.0

ScriptingPlus is a low-frequency project control plane for Scripting on iPhone. It is not a remote IDE.

## Normal workflow

1. Use `@github push_preview` to publish the current phone project to its GitHub folder.
2. Develop, search, refactor, test, and package in the container.
3. ZIP the project contents at the archive root.
4. Call `scripting_compressed_replace_preview` with `path="@project"`.
5. Review the project-level added / modified / deleted summary.
6. Apply with `scripting_change_apply`.
7. Validate on the iPhone and do real-device testing.
8. Push the accepted project state to GitHub.

## Project deployment

`scripting_compressed_replace_preview(project, path="@project", archive_base64, archive_sha256)`
reuses the existing published compressed-transfer tool without adding a new MCP tool.

The ZIP must contain the Scripting project files directly at its root, including `script.json`.

Preview verifies archive structure, size, paths, symbolic-link metadata, manifest name, runnable entrypoint, and the current project snapshot. Apply extracts to staging, revalidates the package, swaps the project directory, verifies the final snapshot, and rolls back on failure.

Project deployment uses the existing compressed-tool payload limit and the existing 1000-entry / 8 MiB archive safety boundaries.

## GitHub push

Use `scripting_run` with virtual project `@github`.

- `action=status`: GitHub availability and permission state.
- `action=push_preview`: compare a complete local project with a repository prefix and prepare one stale-protected logical push.
- `action=queue_preview`: compatibility alias for `push_preview`.

The GitHub token remains in Scripting Settings > GitHub. ScriptingPlus never stores or returns it.

Scripting's native GitHub API writes files with `putContent`, so one logical project apply may still create multiple GitHub commits.

## Compatibility surface

The public MCP inventory remains the existing 19-tool contract. Read/tree/search/edit and small file mutation tools remain available for diagnostics and recovery, but normal development should not use them as a file-by-file remote editing loop.

## Tunnel runtime

Closing the control page does not intentionally stop an active Tunnel. A runtime lease and heartbeat prevent duplicate active instances, and background execution requests Scripting BackgroundKeeper support. iOS can still suspend or terminate the process under system limits.

## Design rules

- Container-first development.
- Project-level transfer instead of file-by-file transfer.
- Preview before mutation.
- Revalidate before apply.
- Stage before replacing live project data.
- Roll back failed deployments.
- GitHub is the durable source/history layer.
- Runtime API Key stays in the script Keychain.
- GitHub token stays in Scripting's Keychain.
- Debug logging is off by default.
