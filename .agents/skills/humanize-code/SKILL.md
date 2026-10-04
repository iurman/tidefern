---
name: humanize-code
description: >-
  Remove the signatures of AI-generated code. Covers three failure families: generic AI-slop
  visual design (purple-to-blue gradients, glassmorphism, centered hero sections, three-column
  rounded-2xl card grids, emoji icons, default Inter, fabricated testimonials, missing focus
  states), insecure or over-engineered backend patterns (string-concatenated SQL, swallowed
  exceptions, missing input validation, no request timeouts, hand-rolled crypto, N+1 queries,
  single-implementation interfaces), and stale dependency versions recalled from training data
  instead of resolved from a registry. Use when writing, reviewing, or refactoring application
  code; when scaffolding a UI, landing page, or component; when choosing a library, runtime,
  base image, or language version; when picking an LTS release; when a review flags generated
  code as generic, insecure, over-abstracted, or outdated; or when asked to de-slop, humanize,
  or productionize AI-written code.
license: MIT
metadata:
  repository: https://github.com/iurman/notarobot
  version: "1.0.0"
---

# Humanize Code

Generated code fails in ways generated prose does not. It compiles, passes review at a glance, and
carries three distinct problems underneath.

1. **It looks generated.** Frontend output converges on one aesthetic because "modern" and "clean"
   in a prompt resolve to the highest-frequency patterns in training data.
2. **It repeats known-bad patterns.** Training corpora contain a decade of insecure and deprecated
   code, and models reproduce it. Roughly half of generated code carries a detectable OWASP Top-10
   issue; missing input sanitization is the most common flaw across every language and model
   studied.
3. **It is out of date by construction.** A model's version knowledge is frozen at training time.
   Measured deprecated-API usage runs 25% to 38% across common Python libraries, and even
   version-conditioned generation succeeds only 48% to 51% of the time.

The third is the one people underestimate, and it has the cleanest fix: stop recalling versions and
start resolving them.

## Routing

| Situation | Read |
| --- | --- |
| UI, components, styling, layout, landing pages | `references/frontend.md` |
| APIs, services, data access, auth, infrastructure | `references/backend.md` |
| Any version number, dependency, runtime, or base image | `references/dependencies.md` |

`references/dependencies.md` applies to **every** task that names a version, including frontend
work. Read it whenever a version appears, regardless of which other file you are using.

Research backing for each family: `references/evidence.md`.

---

## The rule that outranks everything

**Never write a version number from memory.**

Not in a `package.json`, not in a `Dockerfile`, not in a `pyproject.toml`, not in prose, not in a
suggestion, not in an answer to "what version should I use?". Your training data has a cutoff and
the ecosystem does not.

If you cannot reach a registry, say so and leave the version unspecified rather than guessing. An
unresolved placeholder is a visible problem. A confidently wrong version is an invisible one.

The full resolution procedure, with endpoints per ecosystem and the LTS decision tables, is in
`references/dependencies.md`. The short form:

```
1. Read the lockfile / manifest / engines field first. Existing pins are decisions, not defaults.
2. Resolve current versions from the registry, not from memory.
3. Apply the LTS rule for the ecosystem.
4. Change only what the task asked you to change. Report drift, do not silently bump.
```

---

## Working mode

This skill runs in one of two modes. Pick based on what was asked.

**Generate mode.** You are writing new code. Apply the rules as constraints while writing. Do not
produce sloppy code and then clean it, because the cleanup pass tends to preserve the original
shape.

**Review mode.** You are auditing existing code. Produce a findings report, then apply fixes if
asked. Report format:

```
FINDING             SEVERITY  LOCATION              ACTION
stale-runtime       high      Dockerfile:1          node:20 -> node:24 (current LTS, verified)
sql-concat          high      db/users.py:41        parameterized
no-timeout          med       api/client.ts:18      added 10s timeout
gradient-purple     low       app/page.tsx:22       flagged, needs a design decision
single-impl-iface   low       svc/store.go:9        flagged, collapse if no second impl planned
```

Severity is about consequence, not confidence:

- **high**, security, data loss, an unsupported dependency, or a fabricated claim (invented
  testimonials, metrics, or benchmark numbers)
- **med**, correctness, accessibility, or maintenance burden
- **low**, aesthetic or structural, needs a human decision

Do not fix `low` findings without asking. Visual choices belong to whoever owns the product.

---

## What generated code looks like

Cross-cutting patterns that show up in every language. The domain files cover the specifics.

**Uniform everything.** Every function the same length. Every file the same structure. Every
comment the same register. Real codebases are lopsided because real problems are.

**Comments that restate the code.** `// increment the counter` above `counter++`. Generated
comments describe *what* because *why* requires context the model does not have. Delete them.
Keep comments that record a decision, a constraint, or a surprise.

**Defensive noise.** Try/catch around code that cannot throw. Null checks on values that are
constructed three lines above. Validation of internal callers. This reads as thorough and is
actually clutter that hides the checks that matter.

**Premature abstraction.** An interface with one implementation. A factory that returns one type.
A config layer nothing reads. A `utils.ts` with three unrelated functions. Models produce the
shape of extensibility without a second case to justify it.

**Placeholder residue.** `// TODO: implement`, `throw new Error("Not implemented")`,
`const API_KEY = "your-api-key-here"`, `example.com`, `foo@bar.com`, invented company names in
seed data. Either finish it or say plainly that it is unfinished.

**Fabricated everything.** Invented benchmark numbers, made-up testimonials, plausible-looking
API endpoints that do not exist, imported packages that were never published. Package
hallucination is a real supply-chain risk: verify every import resolves in the registry before
you write it.

**No error paths.** The happy path is complete and the failure path is a bare rethrow. Ask what
happens when the network is down, the input is empty, the record is missing, or the call times
out.

---

## Boundaries

- **Match the codebase over these rules.** If the project already has a convention, follow the
  convention. A codebase that is internally consistent beats one that is individually correct in
  every file. Say when you are deviating from this skill to match local style.
- **Do not refactor beyond the request.** Report what you found. Fix what was asked.
- **Do not change a pinned version without saying so.** A pin usually encodes a compatibility
  constraint that is invisible from inside the file.
- **This is not a linter replacement.** It catches what linters do not: taste, currency, and
  structural judgment. Run the project's actual linter too.
- **This is not detection evasion.** The goal is code a reviewer would sign off on, not code that
  fools a classifier.
