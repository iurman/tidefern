# Evidence

Why the profile has the shape it does.

---

## The negative result this skill is built around

*Catch Me If You Can? Not Yet: LLMs Still Struggle to Imitate the Implicit Writing Styles of
Everyday Authors* (arXiv 2509.14543, EMNLP 2025 Findings) is the load-bearing citation.

**Scale.** Over 40,000 generations per model, across 400+ real authors, spanning news, email,
forums, and blogs. Evaluated with an ensemble of authorship attribution, authorship verification,
style matching, and AI detection, rather than a single metric that one method could game.

**Result.** Models approximate user style acceptably in structured formats like news and email.
They fail on nuanced informal writing in blogs and forums.

That split is inconvenient, because informal is exactly the register people most want to sound
like themselves in. A standup message, a Slack reply, a commit message: all informal, all sent
under the user's name, all the cases this skill is for.

**The stated cause:** personal style is "subtle and implicit, making it difficult to specify
through prompts yet essential for user-aligned generation."

Read that carefully. The failure is located in *specification*, not in capability. The model is
not being told enough to reproduce, because the useful information is not the kind that survives
being described. This is the design constraint for everything below.

---

## Why adjectives fail

The default approach is a few samples plus a description: "concise, direct, technical, informal."

That description fits an enormous number of distinct writers. It contains almost no information
that narrows toward one person, because the adjective vocabulary available for describing prose is
tiny compared to the space of actual styles. Two writers can both be accurately called "concise
and direct" and be immediately distinguishable in a single sentence.

Worse, adjectives are the wrong *kind* of instruction. Told to be "concise," a model produces its
own prior for concise, which is the machine centroid again wearing a label. The output ends up
generic in a specific direction rather than particular to anyone.

This is why the template leads with "read the exemplars, the measurements are for checking
afterward." Description is a verification tool. It is a poor generation tool.

---

## What the profile carries instead, and why

### 1. Measured rules

Counted, not estimated.

Style profiling work generally begins by extracting a fingerprint from prior outputs, with
methods ranging from statistical feature extraction to learned style embeddings. Embeddings are
not available to a zero-dependency skill and would not be readable by a human anyway. Counted
features are: sentence-length variance, contraction rate, and punctuation rates are cheap to
compute, stable across samples, and checkable by an agent against a draft.

Sentence-length standard deviation earns its place at the top. It is the feature that survives
every lexical edit, and rhythm is what a reader notices before they can name why something reads
wrong. It is also the feature `humanize-writing` targets structurally (S01), so the two skills
measure the same thing.

The em dash rate is measured for a specific cross-skill reason. `humanize-writing` bans em dashes
by default because the no-information prior for any given text is that em dashes signal machine
generation. When this profile supplies a measured human rate, the ban converts to that limit. The
hard default and the user's real habits resolve from evidence rather than from a toggle.

### 2. Lexicon, including absence

Presence is the obvious half. Absence is the underused half.

A word missing from 400 samples is a strong signal, much stronger than any single word's presence.
Someone who has never written "leverage" or "utilize" will find those words jarring in text
attributed to them, and a never-used list catches bad drafts more reliably than a
characteristic-words list catches good ones.

Absence is also cheap to check. An agent can scan a draft against a 20-word never-used list
deterministically. Verifying that a draft is "concise enough" is a judgment call every time.

### 3. Verbatim exemplars

The most important section, and the one most style profiles omit.

Retrieval-augmented approaches to personalization use the user's prior documents directly at
generation time rather than compressing them into a description first. Pearl is the canonical
example: retrieve past user-authored text, condition on it, generate. The reason it outperforms
description is that the samples carry the implicit properties that the description cannot name,
which is exactly the failure *Catch Me If You Can* identified.

This skill has no retrieval infrastructure and no dependencies, so the profile embeds a fixed
retrieval set: 10 to 15 short samples, chosen for typicality, spanning every register. Reading
them primes generation in a way that reading adjectives does not.

Three consequences follow, and all three are in the template:

- **Exemplars stay verbatim.** Cleaning up punctuation, capitalization, or a typo removes the
  implicit signal that made them worth including.
- **Select for typicality, not quality.** The corpus median is the target. Best-of samples teach a
  voice the person only reaches occasionally.
- **The use procedure says to read them before writing, not after.** Priming works on generation.
  Reading them at check time is too late.

### 4. Register map

One person writes several ways, and a single averaged profile is a blend of all of them, which
matches none.

The *Catch Me If You Can* results are themselves register-split: structured formats work, informal
formats do not. That split is the finding, so a profile that collapses registers is discarding the
axis along which performance actually varies.

The `standup` register is called out specifically because it is the archetypal request: "look at
my commits and write what I did today." Applying someone's longform voice to that produces
something they would never send, and applying their commit voice produces something too terse to
be a message. It is its own register and the template says so, including what to do when there are
no samples of it.

---

## Why local mining rather than asking for samples

Volunteered samples are better per-sample: unambiguously the user's, consent explicit. They are
also rare, few, and biased toward writing the user considers presentable.

Agent transcripts and git history are large, unselfconscious, and already on disk. Hundreds of
commit subjects and chat prompts capture how someone writes when not performing, which is the
register this skill is most needed for and the one *Catch Me If You Can* shows models handle
worst.

The tradeoffs are handled explicitly in `sources.md`:

- **Consent** is asked for before reading, not assumed from file permissions.
- **Contamination** is the main technical risk. A profile built from unfiltered transcripts
  includes model output, which would teach the user's own AI tells back to them and invert the
  purpose of the whole repository. The Claude Code filter (`type == "user"` **and**
  `message.content` is a string, not an array) exists precisely to exclude tool results, and it
  was verified against real transcript records rather than assumed.
- **Dictation** is separated. Voice-transcribed input is common in agent sessions and is not
  written style: a transcription pipeline chose the punctuation, the capitalization, and the
  sentence boundaries. It remains useful for vocabulary and reasoning structure, which is why it
  is kept as its own register rather than discarded.
- **Privacy** is why output is local-only and gitignored by default, and why redaction runs before
  anything reaches disk rather than after.

---

## Honest limits

**This does not close the gap.** *Catch Me If You Can* is a negative result about the underlying
capability, and a better prompt does not repeal it. Measurements plus exemplars plus registers is
the strongest available in-context approach, and it still falls short of what fine-tuning
approaches reach. LoRA-based methods such as StyleAdaptedLM and adapter-mixing approaches such as
AuthorMix outperform in-context style transfer, and all of them require training infrastructure
this skill deliberately does not have.

**Sample size matters more than people expect.** Below 30 samples the measurements are noise. The
template requires stating `insufficient data (n=N)` rather than reporting a confident number
derived from four samples.

**Style drifts.** A profile is a snapshot. Rebuild from scratch rather than patching, since
incremental updates skew toward whatever the user wrote most recently.

**Not an impersonation tool.** The purpose is helping someone write their own messages faster. It
is not for writing as a third party, forging authorship, or defeating authorship analysis where
authorship is being asked in good faith. Forensic-linguistics work on LLMs treats both sides of
this, and the distinction that matters is whether the person whose voice is being used is the one
asking.

---

## Sources

- *Catch Me If You Can? Not Yet: LLMs Still Struggle to Imitate the Implicit Writing Styles of
  Everyday Authors*, arXiv 2509.14543, EMNLP 2025 Findings
- *How Well Do LLMs Imitate Human Writing Style?*, arXiv 2509.24930
- *Authorship Style Transfer with Policy Optimization*, arXiv 2403.08043
- *StyleAdaptedLM: Enhancing Instruction Following Models with Efficient Stylistic Transfer*, arXiv 2507.18294
- *AuthorMix: Modular Authorship Style Transfer via Layer-wise Adapter Mixing*, arXiv 2603.23069
- *Guided Profile Generation Improves Personalization with LLMs*, arXiv 2409.13093
- *GhostWriter: Augmenting Collaborative Human-AI Writing Experiences Through Personalization and
  Agency*, arXiv 2402.08855
- *Large Language Models and Forensic Linguistics*, arXiv 2512.06922
- Pearl, and retrieval-augmented personalization approaches generally
