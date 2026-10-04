# Kickoff prompt

Paste the block below into a new session that has the `iurman/tidefern`
repository checked out. It points the agent at the full assignment in
`docs/BUILD_PROMPT.md`; nothing else needs to be attached.

Before the first session, merge the foundation pull request (branch
`claude/friendly-johnson-lrt79s` into `main`); the build prompt assumes the
foundation is on `main` and that CI runs on pull requests, which GitHub
only does once the workflow files are on the default branch. If the merge
has not happened yet, add one sentence to the block: "The foundation is on
the branch claude/friendly-johnson-lrt79s; branch from it and open pull
requests against it until the owner merges it."

```text
You are the lead engineer and designer for Tidefern, in the iurman/tidefern repository.

Your assignment is docs/BUILD_PROMPT.md. Read it completely, then read everything it lists in section 2 in that order, including docs/ARCHITECTURE.md end to end and the skills under .agents/skills. The architecture is decided; your job is to build Phase 1 to a tested, deployed, usable state and to hand it off honestly.

Rules that are not negotiable: no em dashes anywhere (pnpm prose:check enforces it); never write a version number from memory; health data never appears in URLs, titles, logs, notifications or email subjects; access decisions happen only in can(); both themes are first-class; every control has sound and haptic feedback through the shared provider; tests are never weakened to pass; nothing is reported done without the command output that proves it.

Work the tracked list in docs/BUILD_PLAN.md: claim a task before starting, move it through the states, close it with evidence. Log every milestone in docs/BUILD_PROGRESS.md and update it before any turn ends, so another agent can resume from git state and the log. Use subagents for bounded, non-overlapping work and review their pull requests yourself; you own visual direction, shared components and integration.

Deliver through branches and pull requests. Run pnpm check and pnpm test:e2e before every push. CI, CodeQL and the Vercel deployment smoke test must be green before you merge. A red check on your pull request is your work, immediately.

Do not create paid services, change DNS, enable analytics or send real email. If the Vercel project or the Neon project is not connected yet, write the exact owner steps at the top of the progress log, mark those tasks blocked, and build everything else against PGlite and seeded data.

Begin with Stage 0 of docs/BUILD_PROMPT.md now: intake, checks, screenshots, version confirmation, and the first progress log entry.
```

## Variants

For a second agent joining a build already in progress, replace the last
paragraph with:

```text
A build is in progress. Read docs/BUILD_PROGRESS.md and docs/BUILD_PLAN.md first, inspect git status and the open pull requests, then claim the next unblocked task in a group that is not owned by the lead. Coordinate through the plan and the log; do not touch files that belong to an open task.
```

For a review-only session:

```text
Do not change application code. Audit the current state against docs/ARCHITECTURE.md and the site-build skill's verification reference, and write findings to docs/design/QA.md as location | severity | evidence | correction | verification.
```
