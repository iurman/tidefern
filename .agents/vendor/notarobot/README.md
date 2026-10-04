# notARobot

A collection of agent skills that take the machine fingerprint off what an agent produces: its
prose, its code, and the messages it writes on your behalf.

Portable markdown built against the [Agent Skills](https://agentskills.io) open standard, so the
same files load in Claude Code, Codex CLI, Cursor, Gemini CLI, Copilot, and the other ~30 adopters
without modification. No dependencies, no build step, nothing to break in a sandbox.

```bash
git clone https://github.com/iurman/notarobot && cd notarobot && ./install.sh
```

---

## Contents

- [The problem](#the-problem)
- [The three skills](#the-three-skills)
- [How they compose](#how-they-compose)
- [Install](#install)
- [Configure](#configure)
- [Using them](#using-them)
- [Documentation map](#documentation-map)
- [Evidence and source selection](#evidence-and-source-selection)
- [What this is not](#what-this-is-not)
- [Contributing](#contributing)

---

## The problem

Models write toward the statistical center. Every token is a bet on the likeliest continuation, so
output clusters in a narrow region that no individual writer or engineer occupies. WikiProject AI
Cleanup puts it plainly: LLMs "use statistical algorithms to guess what should come next. The
result tends toward the most statistically likely result that applies to the widest variety of
cases."

That clustering is what a reader notices. And the tells are distributional, so nothing in any individual sentence is wrong, which is why proofreading does not catch
them and why rules can.

The effect is measurable:

| Finding | Measured | Source |
| --- | --- | --- |
| Em dash rate under explicit suppression | 0.0 to 9.1 per 1,000 words, by model | The Last Fingerprint |
| 2024 PubMed abstracts with LLM lexical fingerprints | at least 13.5% | Kobak et al., Science Advances |
| Human vs AI fiction detection from narrative features | 93.2% macro-F1 | StoryScope |
| Detection performance retained by narrative features alone | over 97% | StoryScope |
| Deprecated API usage across 8 Python libraries | 25% to 38% | LLMs Meet Library Evolution |
| Version-conditioned code generation accuracy | 48% to 51% | GitChameleon 2.0 |
| Generated code carrying an OWASP Top-10 issue | roughly half | cross-model studies |

Two of those deserve a second look.

**Over 97%.** StoryScope reached 93.2% macro-F1 separating human from AI fiction, and
discourse-level narrative features alone retain over 97% of the performance of models that also
use stylistic cues. Most of the signal sits above the word level. A humanizer that only fixes
vocabulary is working on a minority of the problem, which is why this repo has a structural tier.

**48% to 51%.** That is version-conditioned generation, meaning the model was *explicitly told*
which version to target and still got it right barely half the time. Prompting is not a fix. The
version has to be resolved from a registry, not recalled.

---

## The three skills

### `humanize-writing`

Rewrites prose to remove AI tells. Around 45 catalogued patterns across four tiers, each carrying
an evidence grade so you can see which rules are backed by measurement and which are folklore.

**Four tiers:** HIGH defaults to `ban` (em dashes, rule of three, negative parallelisms, copula
avoidance, significance inflation, `-ing` tails, era-current AI vocabulary, chatbot artifacts,
sycophantic openers). MEDIUM defaults to `limit` (elegant variation, hedging, signposting, vague
attribution). LOW defaults to `flag`. STRUCTURAL defaults to `ban` and is fixed by rewriting
(sentence and paragraph uniformity, markdown leaking into prose, resolution-shaped endings).

**Three things it does that other humanizers do not:**

- **Era-segmented vocabulary.** The AI word list drifts as models are retrained. "Delve" and
  "tapestry" now read as *dated*, which is worse than artificial. The current set ("showcasing",
  "leverage", "robust", "seamless") is smaller and much harder to notice. A skill that only bans
  `delve` is fighting the last war.
- **A structural tier.** Sentence-length variance survives every lexical fix, and rhythm is what
  a reader registers before they can name why something feels off. On the sample in
  `docs/before-after.md`, raising sd from 6.5 to 9.5 changed the read more than any word swap
  while the word count barely moved.
- **Calibration.** The hard ban is the *no-information* default, not a claim that em dashes are
  bad. A voice profile's measured rate replaces it automatically, and a preference file overrides
  both. See [Configure](#configure).

### `humanize-code`

Three failure families, routed by task.

**Visual slop** (`references/frontend.md`). The convergent aesthetic, named specifically enough to
grep: purple-to-blue gradients (`from-purple-500`, `#667eea`, `#764ba2`), gradient text via
`bg-clip-text text-transparent`, glassmorphism (`backdrop-blur` plus `bg-white/10`), blurred
background orbs, unexamined Inter, the centered hero with twin CTAs, the three-column
`rounded-2xl shadow-xl` card grid, emoji as icons.

These are **flagged, not fixed**. Visual defaults belong to whoever owns the product. Two
exceptions get fixed outright: accessibility failures (missing focus states, `div` as button, no
alt text, contrast failures) because those are defects and not taste calls, and fabricated
testimonials or metrics because those are false claims about the world.

**Backend anti-patterns** (`references/backend.md`). Ordered by measured frequency. Missing input
validation leads, because it is the most common flaw across every language and model studied. Then
string-concatenated SQL, hand-rolled crypto, swallowed exceptions, missing timeouts, N+1 queries,
unbounded results. Plus over-engineering tells: single-implementation interfaces, factories for two
cases, config nothing reads.

**Version currency** (`references/dependencies.md`). The strongest-evidence part of the repo, and
the rule is one line:

> **Never write a version number from memory.**

Not in a manifest, not in a Dockerfile, not in an answer to "what version should I use?". The skill
carries exact endpoints per ecosystem and LTS decision tables. Node is the clean case:

```bash
curl -s https://nodejs.org/dist/index.json   # every release has an explicit `lts` field
curl -s https://endoflife.date/api/<product>.json   # eol and lts for 100+ products
```

At the time of writing, resolving that gives Node 24 (Krypton) as active LTS, with 26 still
Current and both 25 and 23 already past EOL. A model answering from memory names whichever LTS was
current during training.

If there is no network, the skill says so and leaves the version unset. An unresolved placeholder
is a visible problem; a confidently wrong version is an invisible one.

### `voice-profile`

Mines your own words from local agent transcripts, git history, and documents, then generates a
portable `voice-<name>` skill that any harness can load.

It is built around a negative result. *Catch Me If You Can? Not Yet* (EMNLP 2025) evaluated style
imitation across 40,000+ generations per model and 400+ real authors, and found that models
approximate style acceptably in structured registers like news and email while **failing on
informal writing**. That is backwards from what you want, because informal is the register people
most need to sound like themselves in.

The paper locates the failure in *specification*: personal style is "subtle and implicit, making it
difficult to specify through prompts." Handing a model five samples and the adjectives "concise and
direct" does not work, because that description fits thousands of different writers.

So a generated profile carries four things instead:

| Section | Why |
| --- | --- |
| **Measured rules** | Counted, not guessed. Sentence-length sd, contraction rate, punctuation rates, opening and closing habits |
| **Lexicon** | Characteristic words with counts, **plus the words you never use**, which is easier to check and more noticeable when violated |
| **Verbatim exemplars** | 10 to 15 real samples, unedited. Carries the implicit properties no description can name |
| **Register map** | Your commit messages and your essays are different voices. "Summarize my commits" is the *standup* register |

**Sources it reads:** Claude Code (`~/.claude/projects/*/*.jsonl`), Codex CLI
(`~/.codex/sessions/`), Cursor (`state.vscdb`), Gemini CLI, plus git commit history and authored
documents.

**Privacy.** Everything stays local. It asks before reading transcripts, redacts secrets, emails,
and paths before anything reaches disk, and writes profiles to a gitignored location. Profiles are
never committed.

**Dictation is handled separately.** A transcription pipeline chose its punctuation and sentence
boundaries, so voice-transcribed input gets its own register bucket: useful for vocabulary and
reasoning structure, misleading for mechanics.

---

## How they compose

The three are independent, and each directory runs standalone if you copy it out. But they are
designed to reinforce each other:

```
voice-profile  ──measured em-dash rate──>  humanize-writing
                                                 │
                                    lifts the default ban
                                    to your actual rate

humanize-writing  ──same tells──>  humanize-code (marketing copy, comments, READMEs)

humanize-code  ──rule of three──>  humanize-writing (F07 three-column grid is
                                   the same pull as W02 in prose)
```

The clearest illustration is a status update. `docs/before-after.md` shows the same task written
three ways: with no skill (emoji, inline-header list, "significant progress", no actual facts),
with `humanize-writing` alone (competent technical writing by nobody in particular, which is the
correct target for that skill on its own), and with a voice profile (the only version that reads
like a person sent it). Removing tells gets you to neutral. Neutral is not anyone. That gap is
the argument for the third skill.

---

## Install

```bash
git clone https://github.com/iurman/notarobot
cd notarobot
./install.sh
```

Symlinks the skills into every detected harness, after validating them. Start a new agent session
to pick them up.

```bash
./install.sh --local      # this project only, into ./.agents/skills
./install.sh --copy       # copy instead of symlink
./install.sh --validate   # check spec conformance, install nothing
./install.sh --list       # show what is installed where
./install.sh --uninstall  # remove
```

### Where they land

| Path | Read by |
| --- | --- |
| `~/.agents/skills/` | Codex CLI, and the converging cross-agent default |
| `~/.claude/skills/` | Claude Code |
| `./.agents/skills/` | project scope, all harnesses |
| `/etc/codex/skills/` | Codex, organization-wide (not written by the installer) |

### skills.sh

```bash
npx skills add iurman/notARobot --skill '*'
```

Installs into `.agents/skills/` and symlinks to every agent it detects. Use
`--global` for user scope, `--list` to see what is in the repo without installing.

### Claude Code plugin

```
/plugin marketplace add iurman/notarobot
/plugin install notarobot
```

### Harnesses without skill support

The repo ships an [`AGENTS.md`](AGENTS.md) with a condensed version of all three catalogues, read
natively by Codex, Cursor, Copilot, Gemini CLI, Aider, Windsurf, and Zed. It is a fallback:
`AGENTS.md` loads on every turn while skills load only when relevant, and these catalogues run to
thousands of lines.

### Manual

Copy any single skill directory anywhere your agent looks for skills. Each one is self-contained
and references no file outside itself, which `install.sh --validate` enforces.

---

## Configure

Entirely optional. With no configuration, strict defaults apply.

Preferences resolve in three layers, later overriding earlier:

```
1. Skill defaults        (strict)
2. Voice profile         (your measured rates, applied automatically)
3. humanize.md           (explicit statements, wins over both)
```

Layer 2 is the important one. A user who genuinely writes with em dashes should not have to
configure anything, and they do not: once a profile exists, the measured rate replaces the ban.

Layer 3 is for when you want something other than what you measurably do. Drop a `humanize.md` in
your project root, `./.agents/`, or `~/.agents/`:

```markdown
# humanize preferences

## Tells
- em-dash: limit 1 per 500 words     # ban | limit N per M words | allow | flag
- rule-of-three: ban
- hedging: allow
- all-medium: flag                   # group alias; specific IDs override it

## Style
- contractions: always
- oxford-comma: yes
- register: casual
- max-sentence-length: 35

## Never touch
- Direct quotes
- Anything inside code fences
- The CHANGELOG heading format
```

Both the preference file and generated profiles are gitignored by default.

Full grammar:
[`skills/humanize-writing/references/calibration.md`](skills/humanize-writing/references/calibration.md).

---

## Using them

The skills are description-routed, so in most cases you just ask for the thing:

```
"clean up this README"
"does this sound like AI?"
"review this component"
"what Node version should the Dockerfile use?"
"summarize my commits from today as a standup message"
"build a voice profile from my transcripts"
```

In harnesses with explicit invocation, name the skill directly. In others, the frontmatter
`description` fields are written keyword-dense so routing works without you naming anything.

`humanize-writing` always reports before it rewrites:

```
calibration: defaults + voice-isaac (412 samples)

TELL                   LEVEL              N   ACTION
significance-inflation ban                4   cut
copula-avoidance       ban                4   "serves as" -> "is"
ai-vocabulary          ban               11   leveraging, robust, showcases, ...
em-dash                limit 2/1000 [vp]  6   cut to 2 (profile rate 2.1/1000)
hedging                allow [pref]       5   KEPT: humanize.md sets hedging to allow
sentence-variance      ban                -   sd 5.9 -> 7.0
```

`[vp]` marks a voice-profile override, `[pref]` a preference-file override. You should always be
able to see why a tell survived.

---

## Documentation map

| File | What it covers |
| --- | --- |
| [`docs/before-after.md`](docs/before-after.md) | Worked examples with measured counts. Start here |
| [`docs/example-profile.md`](docs/example-profile.md) | What a generated voice profile looks like |
| [`docs/sources.md`](docs/sources.md) | Why each source was chosen, what was rejected, where the evidence runs out |
| [`docs/research.md`](docs/research.md) | Full bibliography with findings |
| [`docs/measure.py`](docs/measure.py) | Rough tell counter, so the documented numbers are checkable |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to add a tell, and the portability rules |
| [`AGENTS.md`](AGENTS.md) | Condensed catalogues for harnesses without skill support |
| `skills/*/SKILL.md` | The skills themselves |
| `skills/*/references/` | Full catalogues, calibration grammar, per-skill evidence |
| `tools/` | Development and CI checks. Never loaded by an agent |

Each skill carries its own `references/evidence.md`, so a directory copied out on its own still
carries its justification.

---

## Evidence and source selection

Every rule traces to a source, and every source is graded by how much it actually proves:
`measured` (a study quantifies the human-machine frequency gap) justifies a `ban`, `catalogued`
(documented in a reference maintained against live cleanup work) a `ban` or `limit`, `observed`
(widely reported, not quantified) a `limit` or `flag`. The grade decides what happens when a rule
conflicts with meaning: a `measured` tell wins, an `observed` tell yields. The full rubric, and
what was rejected, is in [`docs/sources.md`](docs/sources.md).

Primary sources, and what each was chosen *for*:

- **Wikipedia: Signs of AI writing** (WikiProject AI Cleanup) drives the content, language, and
  style tiers. Chosen because it is maintained against live cleanup work, so it tracks the patterns
  as they change, and because it is the only source that segments its vocabulary lists by era.
- **The Last Fingerprint** (arXiv 2603.27006) drives the em dash ban and markdown leakage. The only
  source in the repo justifying a ban on a punctuation mark, because it shows both a 0.0-to-9.1
  range across models and that explicit suppression fails.
- **StoryScope** (arXiv 2604.03136) drives the structural tier. Chosen for a methodological point:
  discourse-level features alone retain over 97% of its detection performance. Adapted, not
  adopted wholesale, since it measured fiction.
- **LLMs Meet Library Evolution** (ICSE 2025, arXiv 2406.09834) and **GitChameleon 2.0** (arXiv 2507.12367) drive the
  version protocol. Together they answer both "use a newer model" and "just tell it the version."
- **Catch Me If You Can? Not Yet** (arXiv 2509.14543) determines the entire `voice-profile`
  architecture. Chosen over the many style-transfer papers because it reports what does *not* work,
  at a scale that makes the negative result credible.

Detection papers (StyleDecipher, stylistic-variation benchmarks) are cited as corroboration but
**no rule is derived from them**, deliberately. Building rewrite rules from a classifier's feature
weights would make this a detector-evasion tool, which optimizes against the wrong target.

[`docs/sources.md`](docs/sources.md) has the full reasoning, including what was rejected and a
section on where the evidence runs out.

---

## What this is not

**Not a detector, and not detection evasion.** Humanizers and classifiers are not inverses. Text
can pass a rules-based cleanup and still classify as machine-written, and text tuned to fool a
classifier can still read wrong to a person. These skills optimize for the human reader. Any effect
on automated detectors is incidental and is not claimed anywhere in this repo.

**Not an impersonation tool.** `voice-profile` is for writing your own messages faster. It is not
for writing as a third party, forging authorship, or evading authorship analysis where authorship
is being asked in good faith.

**Not a linter replacement.** `humanize-code` catches what linters do not: taste, currency, and
structural judgment. Run your actual linter too.

**Not a fabrication license.** Every skill carries a hard no-invention rule. Never invent facts,
names, dates, statistics, citations, testimonials, or metrics to satisfy a style rule. If a vague
attribution cannot be resolved to a real source, the tell stays and gets reported.

---

## What is verified

Claims in this repo are checked rather than asserted. Everything below runs in CI.

| Check | What it proves |
| --- | --- |
| `./install.sh --validate` | Spec conformance. Rejects 8 classes of malformed skill |
| `tools/check_docs.py` | Catalogue IDs unique and resolvable, quick reference matches the body, links resolve, skills stay self-contained, every citation appears in `research.md` |
| `tools/check_snippets.py` | Every shipped bash snippet parses, and every quick-grep command finds seeded specimens, each pattern alternative alive on its own |
| `tools/test_measure.py` | The tell counter behaves as documented, so the dogfood gate cannot pass vacuously |
| `tools/test_transcripts.py` | Transcript extraction filters, against fixtures in each harness's documented shape |
| `tools/check_versions.py` | Every registry endpoint still returns the documented field, and the Node facts in these docs are still true. Runs weekly on a schedule |
| stands-alone job | Each skill directory works when copied out with no repo around it |
| dogfood job | No em dashes in this repo's own prose, no unresolved placeholders, no committed voice profiles |

Run them all locally:

```bash
./install.sh --validate && python3 tools/check_docs.py && \
python3 tools/check_snippets.py && \
python3 tools/test_measure.py && python3 tools/test_transcripts.py && \
python3 tools/check_versions.py && shellcheck --shell=sh install.sh
```

`check_versions.py` needs network and skips gracefully without it. Everything else runs offline.

### Does it actually work

Everything above proves the skills are well-formed. It says nothing about whether they change
behaviour. [`evals/`](evals/README.md) covers that:

```bash
./install.sh
python3 evals/run.py --emit           # print 8 prompts
# run each in a fresh agent session, save replies to evals/out/<id>.txt
python3 evals/run.py --check evals/out
```

No model sits in the grading loop, so the same output always scores the same. Four of the eight
cases check that a skill **does not** do something: strip a direct quotation, invent a citation to
satisfy a style rule, silently redesign your page, or improvise a voice it has no profile for.
Those matter more than the positive cases, and no structural check catches them.

`python3 evals/run.py --selftest` verifies the grader rejects known-bad output, so a passing eval
means something. CI runs that on every push.

### Confidence, stated honestly

Not every claim carries the same weight, and the docs say which is which.

- **Verified against reality.** The Claude Code transcript filter was checked against real records.
  Every registry endpoint in `dependencies.md` was resolved live and is re-checked weekly.
- **Fixture-tested against a documented schema.** Codex and Cursor extraction logic is correct
  given the published schema, which is not the same as confirming the schema is current.
- **Unconfirmed.** The Gemini CLI path is a lead, not a procedure. `sources.md` says so and tells
  the agent to inspect before parsing.
- **Mechanism only, no frequency data.** Frontend tells, which is why they are flagged and left
  for a human.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). New tells need an ID, an evidence grade, a source, and a
worked fix. `observed` is a legitimate grade; unsourced is not.

---

## Prior art

- **[blader/humanizer](https://github.com/blader/humanizer)**, 33 rules derived from the Wikipedia
  guide. The source is the right one and this repo uses it too. What is added here: era
  segmentation, the structural tier, evidence grading, calibration, code, and voice.
- **[jenna-russell/storyscope](https://github.com/jenna-russell/storyscope)**, the StoryScope
  reference implementation. A classifier, so it diagnoses without repairing, and the origin of the finding that
  most detection signal sits above the word level.

---

## License

MIT
