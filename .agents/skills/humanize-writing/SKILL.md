---
name: humanize-writing
description: >-
  Rewrite text to remove the statistical fingerprints of AI generation. Detects and fixes em
  dash overuse, the rule of three, negative parallelisms ("not just X but Y"), copula
  avoidance ("serves as"), significance inflation ("stands as a testament"), AI vocabulary
  ("delve", "showcasing", "underscores"), -ing significance tails, sycophantic openers,
  signposting, hedging, uniform sentence rhythm, and markdown leaking into prose. Use when
  writing, editing, reviewing, or polishing any prose intended for a human reader: essays,
  emails, documentation, README files, commit messages, blog posts, PR descriptions, release
  notes, social posts, reports. Also use when asked to make text sound human, less robotic,
  less like AI, less like ChatGPT, or to strip AI tells, de-slop, or humanize a draft.
license: MIT
metadata:
  repository: https://github.com/iurman/notarobot
  version: "1.0.0"
---

# Humanize Writing

Machine-written prose has a fingerprint. Not because models write badly, but because they write
toward the statistical center. Every token is a bet on the likeliest continuation, so output
clusters in a narrow stylistic region that humans do not occupy. The tells are distributional, not
grammatical. That is what makes them fixable.

Your job is to move text out of that region without damaging it.

## Order of operations

1. **Load calibration.** Read `references/calibration.md`. It tells you how to find the user's
   preference file and voice profile. If neither exists, use strict defaults.
2. **Detect.** Read `references/tells.md`. Scan the text and record every tell with its ID, count,
   and location. Do not fix anything yet.
3. **Rewrite.** Apply fixes in the order given below.
4. **Audit.** Reread your own output against the same catalog. Your rewrite is model output too,
   and it will have acquired new tells. This pass is not optional.
5. **Report.** Emit the findings table, then the final text.

## The four rules that outrank everything

**Preserve information.** Never drop a fact, qualifier, number, or name to make a sentence flow
better. If a fix would cost meaning, keep the meaning and accept the tell. Note it in the report.

**Never invent.** No new facts, names, dates, statistics, quotes, citations, or links. If the
original hedged, you may not un-hedge it. Certainty is information, and you do not have it.

**Voice beats rules.** When a calibrated voice profile conflicts with a default in this skill, the
profile wins. The defaults exist for text that has no owner.

**Do not flatten.** The goal is prose that reads as though a specific person wrote it, not prose
scrubbed of personality. Stripping every tell from a paragraph and leaving behind something
featureless is a failure, not a success. Cutting is most of the work, but not all of it.

## Severity tiers

Every tell in the catalog carries a default enforcement level. Levels are, from strongest:

| Level | Meaning |
| --- | --- |
| `ban` | Reduce to zero. No exceptions except the four rules above. |
| `limit N per M` | At most N occurrences per M words. Cut the weakest ones first. |
| `flag` | Report it, leave it alone unless the user asks. |
| `allow` | Ignore entirely. |

**HIGH tells default to `ban`.** These are the markers with measured, model-distinctive frequency
gaps: em dashes, the rule of three, negative parallelisms, copula avoidance, significance
inflation, `-ing` significance tails, era-current AI vocabulary, inline-header bullet lists, title
case headings, chatbot artifacts, sycophantic openers.

**MEDIUM tells default to `limit`.** Elegant variation, hedging density, signposting, boldface
density, vague attribution, formulaic "Despite challenges" closers.

**LOW tells default to `flag`.** Curly quotes, emoji as bullets, heading level skips, thematic
breaks before headings.

**STRUCTURAL tells default to `ban`** but are fixed by rewriting, not deletion. Uniform paragraph
length, uniform sentence length, markdown leaking into prose, symmetric section sizes,
resolution-shaped endings.

Full catalog with detection cues and worked fixes: `references/tells.md`.

## Rewrite order

Work outside in. Structural fixes change sentence boundaries, so doing them last wastes the
sentence-level work.

### Pass 1: structure

Check the shape of the text before reading it for content.

- **Paragraph length variance.** Model prose produces paragraphs of near-identical length. Human
  prose does not. If every paragraph is three to four sentences, merge some and split others. A
  one-sentence paragraph is allowed and often good.
- **Sentence length variance.** Measure it. If the standard deviation of sentence length is low,
  the rhythm reads mechanical regardless of word choice. Break a long sentence. Then write a short
  one. This single fix does more than most lexical substitutions. On short texts the number is
  noise: below about eight sentences, skip the measurement and judge the rhythm by ear.
- **Markdown leakage.** Headers, bullets, and bold inside text that should be continuous prose.
  Models default to structured output because training corpora are markdown-saturated, and the
  habit survives instructions to stop. If the destination is an email, a comment, or an essay,
  convert lists back into sentences.
- **Symmetric sections.** Three sections of near-equal length under near-parallel headings is a
  generation artifact. Real documents are lopsided because real topics are.
- **Resolution endings.** Models close by restating and resolving. Cut the final paragraph and see
  whether anything was lost. Usually nothing was.

### Pass 2: sentences

- **Em dashes.** Default `ban`. The strongest single tell in the literature: measured at up to 9.1
  per 1,000 words in some models even under explicit instruction to suppress them, against near
  zero for others. Replace with a period, a comma, a colon, or parentheses, choosing by function
  rather than reflexively. An interrupting aside takes parentheses or commas. A setup-payoff takes
  a colon. A hard turn takes a period.
- **Rule of three.** Default `ban`. Three adjectives, three clauses, three examples. Models reach
  for triples because they read as complete. Cut to one or two, or extend to four. The specific
  count matters less than breaking the cadence.
- **Negative parallelism.** Default `ban`. "Not just X, but Y." "It's not X, it's Y." "X rather
  than Y." State the positive claim and stop.
- **Copula avoidance.** Default `ban`. "Serves as", "stands as", "functions as", "represents",
  "acts as", "boasts", "features", "refers to". Almost always "is". Use "is".
- **Significance inflation.** Default `ban`. "Stands as a testament to", "plays a crucial role",
  "underscores the importance of", "marks a turning point", "leaves an indelible mark", "in an
  evolving landscape". Delete the clause. If the significance is real, it is already visible in the
  facts. If it is not, you cannot assert it into existence.
- **The `-ing` tail.** Default `ban`. Sentences ending in a participial phrase that adds
  commentary rather than information: "...ensuring scalability", "...highlighting the need for",
  "...reflecting broader trends", "...contributing to growth". Cut the tail. Check whether the
  sentence lost anything. It did not.

### Pass 3: words

- **AI vocabulary.** Default `ban`, but check the era table in `references/tells.md` before
  cutting. The vocabulary drifted: "delve", "tapestry", "intricate", "pivotal", "meticulous"
  marked 2023 through mid-2024 output and now read as dated rather than merely artificial. The
  current set is narrower and harder to notice: "showcasing", "highlighting", "emphasizing",
  "enhance", "leverage", "robust", "seamless", "comprehensive". Cut those first.
- **Elegant variation.** Default `limit`. Models cycle synonyms to avoid repetition, a side effect
  of repetition penalties. Humans repeat the noun. If a paragraph calls the same thing a "system",
  a "platform", a "solution", and a "framework", pick one and use it four times.
- **Hedging density.** Default `limit 1 per 150`. "Perhaps", "arguably", "it could be argued",
  "some might say", "generally", "typically", "often". One hedge is honest. Four in a paragraph is
  a refusal to make a claim.
- **Vague attribution.** Default `limit`, escalate to `ban` if unsourced. "Experts argue",
  "industry reports suggest", "observers have noted", "studies show". Either name the source or
  drop the appeal. Do not invent a source to satisfy this rule.
- **Signposting.** Default `limit`. "It's worth noting that", "importantly", "notably",
  "additionally", "furthermore", "moreover", "in conclusion". Usually deletable with zero loss.

### Pass 4: framing

- **Sycophantic openers.** Default `ban`. "Great question." "You're absolutely right." "That's a
  really interesting point." Delete and start with the content.
- **Chatbot artifacts.** Default `ban`. "As an AI", "I hope this helps", "Let me know if you'd
  like me to", "Feel free to", knowledge-cutoff disclaimers, "Here's a breakdown of". Also the
  citation-markup residue models leak: `contentReference`, `oaicite`, `turn0search0`, `[cite: 1]`,
  `grok_render_citation_card_json`, `:::writing`.
- **Manufactured drama.** Default `ban`. "The results were staggering." "But here's the thing."
  "And that changes everything."
- **Aphorism closers.** Default `ban`. Models end on a portable-sounding maxim. If the sentence
  would fit on a poster, cut it.

## Signals of human writing

Cutting tells gets you to neutral. These get you the rest of the way, and only apply when the text
has an author and a point of view. Do not add them to reference documentation or API docs.

- **Specific detail over category.** "Tuesday" beats "recently". "Forty minutes" beats "some
  time". Only use specifics you actually have.
- **Asymmetric emphasis.** Real writers spend four paragraphs on what interests them and one
  sentence on what does not. Coverage should be uneven.
- **Admitted uncertainty in the writer's own voice.** "I don't know why this works" is human.
  "It could be argued that the mechanism remains unclear" is not.
- **Sentences that start with And, But, or So.** Models avoid these. Humans use them constantly.
- **Direct address and contractions**, when the register allows.

## Output contract

Always produce both parts, in this order.

**1. Findings.** A table, most severe first. Include tells you chose not to fix and say why.

```
TELL              LEVEL  N   ACTION
em-dash           ban    6   removed all; 4 to periods, 2 to colons
rule-of-three     ban    3   cut to pairs
copula-avoidance  ban    2   "serves as" -> "is"
sentence-variance ban    -   split 2 long, merged 3 short (sd 3.1 -> 7.4)
hedging           limit  5   cut to 1
vague-attribution ban    1   KEPT: source is named in the original, not vague
```

**2. The rewritten text.** Clean, with no commentary interleaved.

If the user asked you to edit a file in place, write the file and print only the findings table.
If the user asked only for detection, print only the findings table.

## When not to apply this

Do not run this skill on:

- **Direct quotations.** Ever. Quoted text is evidence, not prose.
- **Legal, medical, or regulatory text** where hedging and formulaic phrasing are load-bearing.
- **Code, config, or structured data.** For generated code, use the `humanize-code` skill instead.
  This includes code fences and inline code embedded in prose you are otherwise rewriting: leave
  their contents untouched.
- **Text the user wrote themselves**, unless they explicitly asked for an edit. Their tells are
  their voice.

## Reference files

- `references/tells.md` — the full catalog: ID, level, detection cue, fix, evidence strength
- `references/calibration.md` — preference file format and voice profile integration
- `references/evidence.md` — research backing each tier, with citations
