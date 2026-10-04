---
name: voice-profile
description: >-
  Build a reusable profile of how a specific person actually writes, by mining their own words
  from local agent transcripts, git commit messages, and authored documents, then generate a
  portable voice-<name> skill any agent can load. Use when asked to write something that
  sounds like me, in my voice, or as if I wrote it; to draft a standup update, status report,
  commit message, PR description, changelog, or Slack message from git history or notes; to
  learn, capture, extract, or refresh someone's writing style; or to build, update, or inspect
  a voice profile. Also use when a message will be sent under the user's name and should not
  read as machine-written.
license: MIT
metadata:
  repository: https://github.com/iurman/notarobot
  version: "1.0.0"
---

# Voice Profile

Removing AI tells gets text to neutral. Neutral is not anyone. This skill covers the other half:
capturing how one specific person writes, so output can be moved toward them rather than away from
the machine centroid.

The design is dictated by a negative result. *Catch Me If You Can? Not Yet* (EMNLP 2025 Findings)
evaluated style imitation across 40,000+ generations per model and 400+ real authors. Models can
approximate structured registers like news and email. They fail on informal writing, which is
exactly the register people most want to sound like themselves in.

The failure mode is instructive: giving a model a handful of samples and a list of adjectives does
not work. Adjectives like "concise" and "direct" describe thousands of different writers. So a
profile built by this skill carries four things, and a profile missing any of them will
underperform:

1. **Measured rules**, counted, not guessed
2. **Lexicon**, the actual words, including the ones they never use
3. **Verbatim exemplars**, real samples, kept as text
4. **Register map**, because one person has several voices

---

## Two modes

**Build.** Mine sources, measure, generate a `voice-<name>` skill. Runs once, refreshed
occasionally.

**Use.** A generated profile is already installed and you are writing something as the user. Read
the profile, match the register, write, then check against it.

If asked to write in the user's voice and no profile exists, say so and offer to build one. Do not
improvise a voice from the current conversation alone. Two messages is not a style, and guessing
produces a caricature.

---

## Build

### 1. Gather

Read `references/sources.md` for exact paths, record shapes, and filters per harness. Summary:

| Source | Where |
| --- | --- |
| Claude Code | `~/.claude/projects/<slug>/*.jsonl` |
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` |
| Cursor | `state.vscdb`, key `bubbleId:*` |
| Gemini CLI | `~/.gemini/tmp/<hash>/logs.json` |
| Git | `git log --author=<email> --pretty=%B` |
| Documents | Markdown, notes, drafts the user actually wrote |

Two hard requirements:

- **Only text the user typed.** Never assistant output. A profile contaminated with model text
  teaches the user's own tells back to them, which defeats the entire purpose.
- **Stay local.** Do not send transcript contents to any external service. Read files, count
  locally, write locally.

Ask before reading transcript directories. They contain everything the user has ever typed to an
agent, and consent should be explicit rather than assumed.

### 2. Filter

Discard, in this order:

- Pasted code, stack traces, logs, file contents
- Tool results and system-generated messages
- Slash commands and bare paths or URLs
- Anything under ~15 characters ("ok", "yes", "continue")
- Near-duplicates

Keep prose the user composed. Aim for 100 or more samples. Below 30, say the profile is
provisional and mark it as such in the output.

**Check for dictation.** Voice-transcribed input is common in agent sessions and is not written
style. It shows filler disfluencies ("um", "uh", "like"), false starts, run-on structure, and
spelled-out punctuation. It is genuinely useful for capturing vocabulary and how someone
*thinks*, and actively misleading for sentence structure and punctuation. Separate dictated
samples into their own register bucket. Never derive punctuation rates from them.

### 3. Redact

Before anything is written to disk:

- API keys, tokens, passwords, connection strings
- Email addresses other than the user's own, phone numbers
- Absolute paths containing a username, internal hostnames, private URLs
- Third-party names in a private context
- Anything that looks like a secret even if you are unsure

Redact rather than exclude where the sentence is stylistically useful: replace the value with
`[redacted]` and keep the sentence shape.

### 4. Measure

Count. Do not estimate. Every number in the profile should come from actual tallies over the
corpus, and the profile records the sample size next to each figure so a reader can judge it.

Counting at corpus scale means scripting it: a shell pipeline or a short throwaway script written
for the occasion is fine and expected. The zero-dependency rule constrains what this skill ships,
not what you may run. The hard constraints are that the counting happens on this machine and that
transcript content never leaves it.

**Rhythm**
- Mean sentence length, standard deviation, longest, shortest
- Mean paragraph length in sentences
- Fragment rate: sentences with no finite verb

**Punctuation** (per 1,000 words; skip for dictated samples)
- Em dash, en dash, semicolon, colon, parenthetical, ellipsis, exclamation
- Comma density
- Serial comma: yes or no
- Straight or curly quotes

The em dash figure matters beyond this skill. The `humanize-writing` skill reads it to decide
whether its default ban applies to this user.

**Grammar and mechanics**
- Contraction rate: contractions over expandable occurrences
- Sentence-initial `And` / `But` / `So` rate
- Lowercase sentence starts, in informal registers
- First person singular versus plural
- Active versus passive
- Question rate

**Vocabulary**
- Type-token ratio
- Mean word length, share of words over two syllables
- Profanity: rate and which words
- Hedging rate
- Technical register: jargon used bare versus explained

**Formatting**
- Lists versus prose
- Headers in medium-length messages
- Bold and italic rate
- Emoji: rate and which ones
- Code fences versus inline backticks

**Openings and closings**
- How messages start. Greeting, no greeting, straight into content
- How they end. Signoff, question, nothing

### 5. Extract lexicon

- **Characteristic words**, words the user uses far more than baseline, with counts
- **Set phrases**, repeated multi-word constructions, verbatim
- **Transitions**, how they actually move between ideas
- **Never-used**, common words absent from a large corpus. This is as informative as presence.
  Someone who has never written "leverage" or "utilize" in 400 samples should never have those
  words put in their mouth.

### 6. Select exemplars

Pick 10 to 15 short real samples, kept verbatim, spanning every register found. This is the part
the research says matters most, and the part most style profiles omit in favor of adjectives.

Select for typicality, not quality. The goal is representative, not best. Include at least one
sample of the user being terse, one of them explaining something, one of them frustrated or
blunt if such a sample exists.

Redact, but preserve structure, punctuation, and capitalization exactly. A cleaned-up exemplar
teaches the wrong thing.

### 7. Map registers

One person has several voices. Treat each as a separate profile section with its own measurements
where sample size allows:

| Register | Typical source |
| --- | --- |
| commit | git log subject lines and bodies |
| pr-description | PR bodies, longer commit bodies |
| standup | status updates, daily notes |
| chat | agent prompts, short messages |
| longform | docs, posts, READMEs, design notes |
| dictated | voice-transcribed input, kept separate |

The `standup` register is the one most requests need. "Summarize what I did today from my commits"
is a standup request, and applying someone's longform voice to it produces something they would
never send.

If a register has fewer than 15 samples, say so and fall back to the nearest one.

### 8. Generate

Fill `references/profile-template.md` and write it to:

```
~/.agents/skills/voice-<name>/SKILL.md      # every harness on this machine picks it up
```

Use a short handle for `<name>`: `voice-isaac`, not `voice-isaac-urman-writing-style`. The name
must be lowercase letters, digits, and single hyphens only, and must match its directory.

If the user wants to edit it in the repo, also write a copy to `./profiles/voice-<name>/` and
confirm that path is gitignored. **Never commit a profile.** It contains fragments of things the
user typed privately.

Report what you built:

```
voice-isaac built from 412 samples
  claude-code   287    chat, longform
  git           98     commit, pr-description
  documents     27     longform
  dictated      31     (kept separate, excluded from punctuation stats)

registers: chat(260) commit(79) longform(54) pr-description(19) standup(0)
warning: no standup samples. standup requests will fall back to chat.
written: ~/.agents/skills/voice-isaac/SKILL.md
```

---

## Use

1. **Load** the profile from `~/.agents/skills/voice-<name>/SKILL.md`.
2. **Pick the register** from the task, not from the profile's largest bucket. A commit message
   uses `commit` even if `chat` has ten times the samples.
3. **Read the exemplars for that register before writing.** Not the adjectives. The exemplars are
   the highest-signal part of the profile and they work by priming, which requires actually
   reading them.
4. **Write.**
5. **Check** against the measured rules. Sentence length in range, contraction rate roughly right,
   punctuation habits matched, no never-used words, opening and closing shaped correctly.
6. **Verify the content is true.** Voice matching is a style operation. If the task is "summarize
   my commits," the summary must be accurate. Sounding like the user is not permission to invent
   what they did.

### Boundaries

- **Never impersonate to deceive.** This is for writing the user's own messages faster. It is not
  for writing as a third party, forging authorship, or evading authorship detection where
  authorship is being asked in good faith.
- **The user is the author.** They review and send. Say clearly when output is a draft.
- **Do not copy exemplars verbatim** into new text. They are style references, not content.
- **A profile is a description, not a rule.** If the user asks for something that contradicts
  their profile, do what they asked.

---

## Refresh

Style drifts. Rebuild when the user asks, when the profile is more than a few months old, or when
output stops matching. Rebuild from scratch rather than patching; incremental updates skew toward
whatever the user happened to write recently.

---

## Reference files

- `references/sources.md` — per-harness paths, record shapes, extraction filters
- `references/profile-template.md` — the generated skill's structure
- `references/evidence.md` — why the profile is shaped this way
