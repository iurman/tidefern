# AGENTS.md

Entry point for harnesses that read `AGENTS.md` but do not support the Agent Skills format.

If your harness does support skills, ignore this file and run `./install.sh` instead. The skills
carry more detail than can reasonably fit here, and they load only when relevant, so they do not
occupy context on every turn.

---

## What lives here

Three skills in `skills/`, each a directory with a `SKILL.md` and a `references/` folder.

| Skill | Read when |
| --- | --- |
| `humanize-writing` | Writing or editing prose for a human reader |
| `humanize-code` | Writing or reviewing code, or naming any version number |
| `voice-profile` | Writing something that will be sent under the user's name |

Read the relevant `SKILL.md` before starting that kind of work. It will tell you which reference
files to open.

---

## The short version

If you read nothing else, these are the rules that matter most.

### Prose

Remove these outright:

- **Em dashes.** Replace by function: comma or parentheses for an aside, colon for a setup, period
  for a hard turn.
- **The rule of three.** Three adjectives, three clauses, three examples. Cut to two or extend to
  four.
- **Negative parallelism.** "Not just X, but Y." State the positive claim and stop.
- **Copula avoidance.** "Serves as", "stands as", "represents", "boasts". Use "is".
- **Significance inflation.** "Stands as a testament to", "plays a crucial role", "underscores the
  importance of". Delete the clause.
- **The -ing tail.** Sentences ending in ", ensuring X" or ", highlighting Y". Cut at the comma.
- **AI vocabulary.** Current set: showcasing, highlighting, emphasizing, enhance, leverage, robust,
  seamless, comprehensive, streamline. Older set, now dated: delve, tapestry, pivotal, intricate,
  meticulous.
- **Sycophantic openers.** "Great question." Delete and start with the content.

Then fix the structure, which matters more than any single word:

- **Vary sentence length.** Low variance reads mechanical no matter how good the word choice is.
  Break a long sentence, then write a short one.
- **Vary paragraph length.** A one-sentence paragraph is allowed.
- **Strip markdown from prose.** If it is going in an email or a comment, headers and bullets do
  not belong.
- **Cut the closing summary.** Delete the last paragraph and check whether anything was lost.

Two rules override all of the above: never invent facts to satisfy a style rule, and never drop
information to make a sentence flow.

Full catalogue: `skills/humanize-writing/references/tells.md`.

### Code

**Never write a version number from memory.** Not in a manifest, not in a Dockerfile, not in prose.
Resolve it:

| Ecosystem | Resolve from |
| --- | --- |
| npm | `npm view <pkg> version dist-tags deprecated` |
| PyPI | `https://pypi.org/pypi/<pkg>/json` |
| Go | `https://proxy.golang.org/<module>/@latest` |
| Rust | `https://crates.io/api/v1/crates/<name>` (needs a User-Agent header) |
| Node runtime | `https://nodejs.org/dist/index.json`, use the `lts` field |
| Everything else | `https://endoflife.date/api/<product>.json` |

Read the lockfile first. An existing pin is a decision, not a default. If you cannot reach a
registry, say so and leave it unspecified. Do not guess.

Fix on sight:

- Unvalidated request input. The most common flaw in generated code.
- String-concatenated SQL. Parameterize.
- Hand-rolled crypto. MD5 or SHA for passwords, `Math.random()` for tokens, `==` on secrets.
- Swallowed exceptions. `except: pass`, empty catch blocks.
- Missing timeouts on outbound calls.
- Removed focus outlines with no `:focus-visible` replacement.
- `<div onClick>` instead of `<button>`.

Flag, do not silently rewrite:

- Purple-to-blue gradients, glassmorphism, blurred orbs, centered heroes, three-column
  `rounded-2xl` card grids, emoji as icons. Visual defaults are a human decision.
- Interfaces with one implementation, factories for two cases, config nothing reads.

Never generate fabricated testimonials, customer logos, or metrics. Those are false claims about
the world, not design choices.

Full catalogues: `skills/humanize-code/references/{frontend,backend,dependencies}.md`.

### Voice

If a `voice-<name>` skill is installed, read it before writing anything under the user's name.
Read the exemplars for the matching register, not just the description. Match the register to the
task: a commit message uses the `commit` register even if `chat` has more samples.

If no profile exists and you are asked to write in the user's voice, say so and offer to build
one. Do not improvise a voice from the current conversation.

Building a profile reads local transcripts. Ask first.

Full procedure: `skills/voice-profile/SKILL.md`.

---

## Applying this to your own output

These rules apply to what you write in this repository too. The prose in these files was written
under them.

If you are contributing, run `./install.sh --validate` before committing. It checks every
`SKILL.md` against the Agent Skills spec: name matching, charset, description length, file size,
dangling references, and portability violations such as naming a harness-specific tool.
