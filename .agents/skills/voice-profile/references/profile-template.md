# Profile template

The generated `voice-<name>/SKILL.md` is itself a valid Agent Skill, so every harness on the
machine loads it without extra configuration.

Fill every section. Where a measurement could not be made, write `insufficient data (n=N)` rather
than omitting the line or guessing. A visible gap is useful; a silent one is not.

Replace `<name>`, `<Full Name>`, and every bracketed value. Numbers shown below are illustrative.

---

```markdown
---
name: voice-<name>
description: Write as <Full Name>. Their measured writing style, characteristic vocabulary, and real samples across commit, standup, chat, and longform registers. Use when drafting anything that will be sent under their name: commit messages, PR descriptions, standup and status updates, changelogs, Slack and chat messages, emails, docs. Also use when asked to write in their voice, as them, or to make a draft sound like them rather than like a model.
license: MIT
metadata:
  generated-by: voice-profile
  generated: "<YYYY-MM-DD>"
  samples: "<N>"
  sources: "<claude-code:287 git:98 documents:27>"
---

# Voice: <Full Name>

Built <YYYY-MM-DD> from <N> samples. Confidence: <high | provisional>.

<One paragraph. What is distinctive about how this person writes, stated concretely enough that
someone could pick their message out of five. "Short sentences, no hedging, lowercase in chat,
explains by example rather than definition." Not "clear and professional.">

## Read this first

Before writing, read the exemplars for the target register below. The measurements are for
checking your draft afterward. The exemplars are what you write from.

## Measured rules

All figures counted over the corpus. Sample size in parentheses where a register is thin.

### Rhythm
- Sentence length: mean <14.2> words, sd <8.1>, range <2>-<47>
- Paragraph length: mean <2.4> sentences
- Fragments: <11>% of sentences

### Punctuation (per 1,000 words; excludes dictated samples)
- Em dash: <2.1>
- Semicolon: <0.3>
- Colon: <4.8>
- Parentheses: <6.2>
- Ellipsis: <0.4>
- Exclamation: <0.9>
- Serial comma: <yes | no | inconsistent>
- Quotes: <straight | curly>

### Grammar and mechanics
- Contractions: <87>% of expandable occurrences
- Opens sentences with And/But/So: <18>% of sentences
- Lowercase sentence starts: <chat only, 40% | never>
- First person: <singular | plural | mixed>
- Passive voice: <6>% of clauses
- Questions: <9>% of sentences

### Vocabulary
- Mean word length: <4.3> characters
- Words over two syllables: <14>%
- Profanity: <rate, which words, which registers | none>
- Hedging: <0.8> per 100 words
- Technical terms: <used bare | explained on first use>

### Formatting
- Lists vs prose: <prose except for 3+ parallel items>
- Headers in medium messages: <rare | common>
- Bold: <0.4> per 100 words
- Emoji: <rate, which ones, which registers | none>
- Code: <inline backticks for identifiers, fences for 3+ lines>

### Openings and closings
- Opens with: <straight into content | greeting | context sentence>
- Closes with: <nothing | a question | a signoff: "<verbatim>">

## Lexicon

**Characteristic**, used far above baseline, with counts:
<`ship` (34), `roughly` (28), `wire up` (19), `the thing is` (14), `punt` (11)>

**Set phrases**, verbatim, repeated:
- "<took a pass at it>"
- "<not blocking, but>"
- "<let me know if that's off>"

**Transitions**, how they actually move between ideas:
<`so`, `anyway`, `that said`. Rarely `however`, never `furthermore`.>

**Never used**, absent from the whole corpus. Do not put these words in their mouth:
<`leverage`, `utilize`, `delve`, `robust`, `seamless`, `comprehensive`, `moreover`, `furthermore`,
`in conclusion`, `it's worth noting`>

## Registers

### commit (n=<98>)
<Imperative mood, lowercase, no trailing period, under 60 characters. Body only when the change
needs a reason, separated by a blank line, wrapped at ~72. No conventional-commit prefixes.>

Exemplars:
```
<fix race in the session reaper>
<bump node to 24, 22 is past eol>
<revert "cache the manifest", broke cold start>
```

### standup (n=<0>)
<insufficient data. Fall back to the chat register, kept factual and past tense.>

Exemplars:
```
<none available>
```

### chat (n=<287>)
<Lowercase starts, heavy contractions, frequent fragments. Asks rather than assumes. Says "i
think" instead of hedging with "perhaps".>

Exemplars:
```
<can you check why the build's failing on arm64? works fine locally>
<yeah that's fine. i'd rather not touch the migration path right now though>
<hm. does that actually fix it or just hide the warning>
```

### longform (n=<54>)
<Full sentences, sentence case, still short. Leads with the conclusion. Examples before
definitions. Rarely more than three paragraphs without a concrete case.>

Exemplars:
```
<verbatim sample, 2-4 sentences>
<verbatim sample, 2-4 sentences>
```

### pr-description (n=<19>)
<What changed and why, two or three sentences. Notes what was deliberately left out. No headers
under ~200 words.>

Exemplars:
```
<verbatim sample>
```

### dictated (n=<31>)
<Voice-transcribed. Vocabulary and reasoning structure only. Do not derive punctuation,
capitalization, or sentence length from this register.>

Exemplars:
```
<verbatim sample>
```

## Anti-patterns

Things this person does not do. Violating these is more noticeable than missing a habit.

- <Never opens with a greeting in chat>
- <Never uses "leverage", "utilize", or "robust">
- <Never writes a closing summary paragraph>
- <Never uses bullet points for fewer than three items>
- <Never hedges with "perhaps" or "arguably"; says "i think" or states it flat>
- <Never uses emoji outside of a reaction>

## Checking a draft

1. Does it use any never-used word? Rewrite.
2. Is sentence-length sd within roughly 3 of <8.1>?
3. Contraction rate near <87>%?
4. Register-correct opening and closing?
5. Does it violate an anti-pattern?
6. Read the exemplars again. Would this sit among them without standing out?

## Limits

- Built from <N> samples on <YYYY-MM-DD>. Style drifts; rebuild with `voice-profile`.
- <Thin or missing registers, and what they fall back to.>
- <Whether dictated samples are a large share, and what that caps.>
- A profile describes; it does not override. If the user asks for something that contradicts this
  file, do what they asked.
- Voice matching is style only. Content must still be true. Sounding like this person is not
  permission to invent what they did.
```

---

## Notes on filling it in

**Exemplars are the highest-signal section.** Do not skip them, do not paraphrase them, do not
clean them up. Punctuation, capitalization, and typos stay as written, minus redaction. Ten real
samples outperform any amount of description, which is the whole finding behind this template's
shape.

**Anti-patterns are the second highest.** Absence is easier to check than presence and more
noticeable when violated. A profile with a strong never-used list will catch most bad drafts on
its own.

**Be concrete in the prose sections.** "Direct and concise" describes half of all writers.
"Answers the question in the first sentence, then gives one example, then stops" describes one.

**Keep the description field specific.** It is what routes the skill. It should name the person
and the registers, because that is what a request will mention.

**Do not invent measurements.** `insufficient data (n=4)` is a useful statement. A confident
number derived from four samples is not.
