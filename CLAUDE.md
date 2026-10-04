@AGENTS.md

# Claude-only notes

- When the context is compacted, preserve exactly: the task ids claimed in
  `docs/BUILD_PLAN.md`, every file modified in the session, the commands run
  with their results, open follow-ups, and the exact wording of any owner
  decision or constraint.
- Rules that must hold every time live in the gates `pnpm check` runs, not in
  prose; add a gate before adding a sentence here.
