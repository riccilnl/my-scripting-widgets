# T9 Bridge Consistency: 2026-10-23

## Workspace / scope
- Isolated worktree: previews/rime-t9-consistency-dev; branch fix/rime-t9-consistency, starting at local main 66da334.
- Only the Lua bridge, test harness, CI test gate and this technical note are changed.
- This is source development: no iPhone install, release, merge to main, or remote push.

## Implemented corrections
1. The unresolved-digit offset is the maximum of Rime active segment start and the validated digit length of selected syllables. Previously the same selected prefix could be consumed twice after a segment moved forward.
2. Left-column Mandarin pinyin options can now be derived from legal syllables when the first 96 Rime candidates do not expose a complete compatible phrase. Rime-sourced options remain first, and no Hanzi candidate or ranking is invented.
3. For raw numeric input, explicit selected syllables are reconciled against their exact digit prefixes. Deleting into a selected syllable rolls back only invalidated selections.
4. Legal pinyin choices are lazily pre-indexed by their first two numeric digits, avoiding a full canonical syllable scan per key. Option limits and initial-letter handling remain bounded.

## Verification
- Lua simulation loads the actual production T9BridgeAsset embedded Lua, not a reimplementation.
- 24 fixed phrases x 5 menu-source cases x 2 segment states, plus 300 seeded random multi-syllable sequences = 540 completed sequences.
- Extra: 1,200 randomized digit inputs, selection rollback, partial prefix, rank-97 candidate, filter stream preservation, partial candidate commits, invalid selections.
- Independent comparison: 5,000 simulated F23 probes on Fedora LuaJIT: original 0.0927 CPU seconds, optimized 0.0738 CPU seconds. These timings do not predict iPhone speed.
- CI workflow now installs LuaJIT and runs the new bridge simulator alongside existing Node tests.
- Run: node --test scripts/rime输入法/tests/runtime.test.cjs scripts/rime输入法/tests/t9_bridge.test.cjs scripts/update_links.test.js

## Remaining evidence / risks
- No native wanxiang_t9 librime runtime was available for this round; the mock cannot prove actual Rime candidate comments or segment positions.
- No iPhone Scripting interaction, keyboard input, marked-text, or touch acceptance yet.
- Real full/abbreviated/fuzzy path mixing, other dictionary variants, and host partial commit transitions require native reproduction.
- Do not promote or release until the native/iPhone acceptance cases succeed.
