# Rime A/B test packages (NOT an official release)

- Baseline 0.3.44: Rime基线测试, from the verified release 56125d2.
- Performance 0.3.45-preview: Rime性能测试, unmerged performance changes.

The two independent Scripting project names do **not** isolate Rime
shared dictionaries, user databases, schema deployments or App Group data.
Do not run schema installation or dictionary updates during comparison.
Use one test keyboard at a time and retain the official Rime 0.3.44.

Compare typing, pinyin selections, candidate scrolling, expanded
grid taps, haptic responsiveness, launch and exit behavior.
