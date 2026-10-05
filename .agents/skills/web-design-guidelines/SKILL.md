---
name: web-design-guidelines
description: Pre-merge audit of changed UI files in apps/web against the Vercel Web Interface Guidelines rule file, fetched at a pinned commit at audit time, with Tidefern's recorded overrides applied. Use before a pull request that touches pages, components, styles or motion, or when asked to review UI, check accessibility or audit design.
license: MIT. Wrapper written for Tidefern; the upstream skill and rule file are MIT, Copyright (c) 2025 Vercel Labs.
metadata:
  upstream-skill: vercel-labs/agent-skills skills/web-design-guidelines at 063bee94c3f4df8453406c830b0a7df0f2860278
  upstream-rules: vercel-labs/web-interface-guidelines command.md at e3d624baaf29dc1fc645aff3e38f03e564d2d6b1
  pinned-on: "2026-10-05"
---

# Web interface guidelines audit

A pre-merge audit for UI files, adapted from the Vercel `web-design-guidelines`
skill. The upstream skill fetches its rule file from a moving branch; this
wrapper pins a commit so an audit is reproducible, and it is not vendored
because the rule file carries em dashes that the repository's prose gate
rejects. The punctuation is upstream's; nothing in this repository copies it.

## When to run it

Before opening or marking ready any pull request that changes
`apps/web/src/app/**`, `apps/web/src/components/**`,
`apps/web/src/app/globals.css` or motion code. Run it on the changed files
only.

## How to run it

1. Fetch the pinned rule file (never the `main` branch):

   ```sh
   curl -sL https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/e3d624baaf29dc1fc645aff3e38f03e564d2d6b1/command.md -o /tmp/wig-command.md
   ```

   The file is 190 lines at that commit. If the fetch fails, say so and
   stop; do not audit from memory.
2. Read the changed files (`git diff --name-only origin/main -- apps/web/src`).
3. Check each file against every rule in the fetched file, then apply the
   overrides below, which win over the rule file.
4. Report in the terse `path:line - finding` format the rule file asks for,
   grouped by file, with `pass` for a clean file. Fix what the task owns;
   record the rest as follow-ups in `docs/BUILD_PROGRESS.md`.

## Tidefern overrides (the architecture record wins)

| Upstream rule | Tidefern rule | Why |
| --- | --- | --- |
| Title Case for headings and buttons (line 144 at the pinned commit) | Page titles in Title Case, everything else in sentence case | `docs/ARCHITECTURE.md` section 13.8; expect the audit to flag this and answer it once per pull request |
| `text-wrap: balance` or `text-pretty` on headings | `text-wrap: balance` only | `text-wrap: pretty` is not Baseline (section 13.6) |
| Preload critical fonts with `<link rel="preload">` | Leave to `next/font/local` | It emits the preload links and fallback metrics (section 13.5) |
| Placeholders end with an ellipsis and show an example | No placeholder-as-label; help text carries the example | Section 13.10 form anatomy |
| `autocomplete="off"` on non-auth fields | Only where a password manager would otherwise fire; health fields keep `inputMode` and sensible `autocomplete` | Section 13.9 (3.3.8) and 13.10 |
| Toasts and async updates use `aria-live="polite"` | Same, and every cue also has visible text; sound never carries meaning alone | Section 14.1 |

Everything else in the rule file applies as written: reduced motion honoured,
transform and opacity only, no `transition: all`, `color-scheme` and
`theme-color` set, `Intl` for dates and numbers, tabular numerals in
compared columns, designed empty states, undo or confirmation for
destructive actions, error copy that says what to do next.

## Updating the pin

Resolve the new commit with
`git ls-remote https://github.com/vercel-labs/web-interface-guidelines HEAD`,
read the diff between the pinned and the new rule file, update both
`metadata` lines and the URL above, and record the change in
`docs/design/RESEARCH.md`.
