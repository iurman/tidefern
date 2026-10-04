# Tell catalog

> **Attribution and license.** Roughly 30 of the tells below derive from
> [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing),
> maintained by
> [WikiProject AI Cleanup](https://en.wikipedia.org/wiki/Wikipedia:WikiProject_AI_Cleanup),
> including its category structure, its era-segmented vocabulary lists, and its
> per-model citation-residue table.
>
> Wikipedia text is licensed
> [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), which carries
> a share-alike obligation. **This file is therefore dual-licensed: CC BY-SA 4.0
> applies to the portions derived from that guide.** The rest of this repository
> is MIT. See [CREDITS.md](https://github.com/iurman/notARobot/blob/main/CREDITS.md).
>
> The structural tier (S01 to S06) is not from Wikipedia. It derives from
> StoryScope, arXiv 2604.03136.


Every tell has an ID, a default enforcement level, and an evidence strength. Override levels via
the preference file described in `calibration.md`.

**Evidence strength** is how confident we are that the pattern actually separates machine from
human writing:

- **measured**, a published study quantifies the frequency gap
- **catalogued**, documented in a maintained reference (primarily Wikipedia's *Signs of AI
  writing*, kept current by WikiProject AI Cleanup against live cleanup work)
- **observed**, widely reported by practitioners, not yet quantified

A tell being merely *observed* is not a reason to skip it. It is a reason to weigh it less when it
conflicts with meaning.

---

## Tier HIGH — default `ban`

### W01 · em-dash · measured

**Cue:** `—` (U+2014) and `–` (U+2013) used as sentence punctuation.

**Why:** The single most-studied prose marker. Frequency ranges from 0.0 per 1,000 words (Llama)
to 9.1 (GPT-4.1) *under explicit instructions to suppress markdown formatting*. The persistence
under suppression is the point: headers and bullets disappear when instructed, em dashes do not.
The leading explanation is markdown-saturated training data leaking into prose. Em dash usage in
scientific abstracts more than doubled between 2021 and 2025.

**Fix:** Choose the replacement by the dash's function, not by reflex.

| Function | Replacement |
| --- | --- |
| Interrupting aside | commas, or parentheses if genuinely parenthetical |
| Setup then payoff | colon |
| Hard turn or reversal | full stop, new sentence |
| Appended afterthought | full stop, or cut the afterthought |
| List introduction | colon |

> The API is fast — usually under 40ms — but it rate limits aggressively.
> → The API is fast, usually under 40ms, but it rate limits aggressively.

> We shipped it Tuesday — three weeks late.
> → We shipped it Tuesday. Three weeks late.

**Note:** en dashes in numeric ranges (`2019–2024`) and hyphens in compounds are not this tell.
Leave them.

### W02 · rule-of-three · measured

**Cue:** Three coordinated adjectives, clauses, or examples. `X, Y, and Z` where the triple carries
no more information than a pair would.

**Why:** Triples read as complete and balanced, so a next-token optimizer converges on them.
Catalogued as a primary sign; used to make superficial analysis look comprehensive.

**Fix:** Cut to the two strongest, or extend to four if all four earn their place. Never keep
exactly three unless the three are enumerated facts.

> a fast, clean, and reliable interface → a fast, reliable interface

### W03 · negative-parallelism · catalogued

**Cue:** `not just X, but Y` · `not only X but also Y` · `it's not X, it's Y` · `X rather than Y` ·
`no X, no Y, just Z`

**Why:** A rhetorical frame that manufactures contrast without adding content. Particularly heavy
in Grok output for the `rather than` variant.

**Fix:** Assert the positive half. Delete the negated half unless the contrast is genuinely
informative.

> This isn't just a linter, it's a design system. → This is a design system.

**The `X rather than Y` variant is weaker than the others and takes `limit 1 per 400 words`, not
`ban`.** The first three forms are rhetorical: they manufacture a contrast to make a flat claim
feel weighty, and deleting the negated half loses nothing. `X rather than Y` is often a genuine
either/or where both halves carry information, and in technical prose it is frequently the
clearest available phrasing.

Density is the signal. One considered use is fine. Six in a page is the tell, and the fix is
usually `instead of`, `and not`, or splitting into two sentences.

This distinction came out of running the catalogue against this repository's own documentation,
which used the construction 33 times before anyone noticed.

### W04 · copula-avoidance · catalogued

**Cue:** `serves as` · `stands as` · `functions as` · `operates as` · `acts as` · `represents` ·
`boasts` · `features` · `maintains` · `offers` · `refers to` · `began his career as` (for "was")

**Why:** Models route around the plain copula because elaborate verbs score as more informative.
They are not.

**Fix:** `is` / `are` / `was`. Almost every time.

> The cache serves as the primary bottleneck. → The cache is the bottleneck.

### W05 · significance-inflation · catalogued

**Cue:** `stands as a testament to` · `plays a crucial/pivotal/vital/key role` · `underscores the
importance of` · `highlights the significance of` · `marks a turning point` · `represents a shift`
· `leaves an indelible mark` · `in an evolving landscape` · `setting the stage for` · `deeply
rooted` · `a focal point for`

**Why:** Asserts importance instead of demonstrating it. The most consistently flagged content
pattern in cleanup work.

**Fix:** Delete the clause. Do not replace it. If the significance is real it is already implied
by the facts you stated.

### W06 · ing-tail · catalogued

**Cue:** A sentence ending in a present-participle phrase that comments rather than informs:
`, ensuring X` · `, highlighting X` · `, reflecting X` · `, contributing to X` · `, allowing for X`
· `, fostering X` · `, cementing X` · `, paving the way for X`

**Why:** A syntactic slot models fill to extend a sentence toward a satisfying length. Catalogued
under "superficial analyses."

**Fix:** Cut at the comma. Verify nothing was lost. If the tail carried a real causal claim,
promote it to its own sentence with a real verb.

> We moved to Postgres, ensuring better scalability.
> → We moved to Postgres. Query latency dropped by half.  *(only if true)*
> → We moved to Postgres.  *(otherwise)*

### W07 · ai-vocabulary · measured

**Cue:** See the era table below. Vocabulary drifts as models are retrained, so a static list
misfires. At least 13.5% of 2024 PubMed abstracts show lexical LLM fingerprints from this family.

| Era | Words |
| --- | --- |
| 2023 – mid 2024 | delve, tapestry, testament, intricate, intricacies, interplay, meticulous, meticulously, pivotal, underscore, crucial, garner, bolstered, enduring, vibrant, boasts, additionally, realm, myriad |
| mid 2024 – mid 2025 | align with, bolstered, crucial, emphasizing, enhance, enduring, fostering, highlighting, pivotal, showcasing, underscore, vibrant |
| mid 2025 onward | emphasizing, enhance, highlighting, showcasing, leverage, robust, seamless, comprehensive, streamline, empower, unlock |
| Model-specific | Grok: causal, empirical, correlate |

**Fix:** Substitute the plain word. `leverage` → `use`. `enhance` → `improve`. `robust` → say what
actually makes it robust, or cut. `showcasing` → `shows`, or restructure.

**Caution:** Any of these can be the correct word. `crucial` in a medical paper is not a tell.
Density decides which level applies, not presence: at around 1 per 200 words, report it as a
flag; above 3 per 200, the tier's ban applies and the words go. In between, cut the ones used as
filler and keep the ones doing real work.

### W08 · inline-header-list · catalogued

**Cue:** A bullet list where every item is `**Bolded Phrase:** explanation.`

**Why:** The single most recognizable structural artifact of chat output.

**Fix:** If the items are genuinely parallel data, keep the list and drop the bold. If they are
prose, convert to paragraphs. Do not keep both the bold and the colon.

### W09 · title-case-heading · catalogued

**Cue:** `## Getting Started With The API`, capitalizing every significant word.

**Fix:** Sentence case. `## Getting started with the API`.

### W10 · chatbot-artifact · catalogued

**Cue:** `As an AI` · `I hope this helps` · `Let me know if you'd like` · `Feel free to` ·
`Here's a breakdown` · `I can't browse the internet` · knowledge-cutoff disclaimers · `Certainly!`
· `Of course!`

Also citation-markup residue, which is unambiguous evidence of a paste:

| Model | Residue |
| --- | --- |
| ChatGPT | `contentReference`, `oaicite`, `oai_citation`, `turn0search0`, `attributableIndex`, stray `+1` |
| Gemini | `[cite: 1]`, `[span_1](start_span)` |
| Grok | `grok_card`, `grok_render_citation_card_json` |
| DeepSeek | lenticular brackets `【】`, dagger symbols |
| Perplexity | `attached_file`, `ppl-ai-file-upload` |
| Unclassified | `:::writing` |

**Fix:** Delete. Always.

### W11 · sycophantic-opener · observed

**Cue:** `Great question!` · `You're absolutely right` · `That's a really interesting point` ·
`Excellent catch`

**Fix:** Delete. Start with the content.

### W12 · manufactured-drama · observed

**Cue:** `But here's the thing` · `The results were staggering` · `And that changes everything` ·
`Here's where it gets interesting` · `Plot twist:`

**Fix:** Delete the framing, keep the claim.

### W13 · aphorism-closer · observed

**Cue:** A final sentence that generalizes into a portable maxim. If it would fit on a poster and
survive removal from context, it is this tell.

**Fix:** Cut. Usually the paragraph above it was the actual ending.

### W14 · promotional-register · catalogued

**Cue:** `nestled in the heart of` · `boasts a` · `rich and vibrant` · `groundbreaking` ·
`renowned` · `a diverse array of` · `natural beauty` · `commitment to excellence` ·
`state-of-the-art`

**Fix:** Replace with the factual claim underneath, or delete.

---

## Tier MEDIUM — default `limit`

### W20 · elegant-variation · catalogued · `limit`

**Cue:** The same referent named three or more different ways in one passage: system / platform /
solution / framework.

**Why:** A direct artifact of repetition-penalty decoding. Humans repeat nouns freely.

**Fix:** Pick one term. Repeat it. Repetition of a concrete noun is not a style flaw.

### W21 · hedging-density · observed · `limit 1 per 150 words`

**Cue:** `perhaps` · `arguably` · `it could be argued` · `some might say` · `generally` ·
`typically` · `tends to` · `in many cases` · `relatively`

**Fix:** Keep the one hedge that carries real uncertainty. Cut the rest. Never remove a hedge that
was protecting a claim you cannot verify.

### W22 · signposting · catalogued · `limit 1 per 300 words`

**Cue:** `It's worth noting that` · `Importantly` · `Notably` · `Additionally` · `Furthermore` ·
`Moreover` · `In conclusion` · `To summarize` · `That said`

**Fix:** Delete. Test by reading the sentence without it. If the logical relation survives, the
connective was decorative.

### W23 · vague-attribution · catalogued · `limit`, escalate to `ban` if unsourced

**Cue:** `experts argue` · `studies show` · `industry reports suggest` · `observers have noted` ·
`critics have pointed out` · `it is widely believed`

**Fix:** Name the source, or drop the appeal and state the claim in your own voice. Do not
fabricate a citation to satisfy this rule. Report it as kept if you cannot resolve it.

### W24 · challenges-closer · catalogued · `ban` in encyclopedic text, `limit` elsewhere

**Cue:** A closing section shaped `Despite [positives], [subject] faces several challenges...`
followed by a vague forward-looking sentence. Headings named `Challenges and Legacy` or
`Future Outlook`.

**Fix:** Cut the section. If specific challenges are known, state them as facts without the frame.

### W25 · boldface-density · catalogued · `limit`

**Cue:** More than roughly one bolded span per paragraph, or bold applied mechanically to every
instance of a term.

**Fix:** Bold only what a reader skimming for one thing would need. Usually nothing.

### W26 · false-range · observed · `limit`

**Cue:** `from X to Y` where the two poles are not actually endpoints of a range:
`from startups to enterprises`, `from design to deployment`.

**Fix:** Say the actual scope, or list the real members.

### W27 · passive-drift · observed · `limit`

**Cue:** Agentless passive where the agent is known: `it was decided`, `the change was made`.

**Fix:** Name the actor. Keep the passive where the agent is genuinely unknown or irrelevant.

---

## Tier LOW — default `flag`

| ID | Tell | Cue | Fix |
| --- | --- | --- | --- |
| W40 | curly-quotes | `"` `"` `'` in plain-text or code contexts | Straight quotes |
| W41 | emoji-bullet | 🚀 ✅ 🔥 as list markers | Real list markers |
| W42 | heading-skip | `##` followed by `####` | Sequential levels |
| W43 | thematic-break | `---` immediately before every heading | Remove |
| W44 | table-misuse | A table holding two rows of prose | Prose |
| W45 | hyphen-pair | `AI-powered`, `game-changing`, `next-generation` stacked | Unstack or cut |
| W46 | placeholder-residue | `[Your Name]`, `[Insert X]`, `Lorem ipsum` | Fill or remove |

---

## Tier STRUCTURAL — default `ban`, fixed by rewriting

These are the highest-signal features after lexical ones, and the ones most humanizers miss.
StoryScope reaches 93.2% macro-F1 separating human from AI fiction largely on features at this
level: models cluster in a shared stylistic region while human authors spread out.

### S01 · sentence-length-uniformity

**Cue:** Low standard deviation in sentence length. Compute it. Model prose commonly sits near
sd 3 to 4 with a mean around 18 to 22 words. Human prose runs sd 8 or higher.

**Fix:** Split the longest sentence. Write a short one after it. Target sd above 7. This one fix
changes the read more than any lexical substitution.

**Caution:** The threshold is a heuristic, and on short texts the number is noise. Below about
eight sentences, do not compute it or chase it; judge the rhythm by ear.

### S02 · paragraph-length-uniformity

**Cue:** Every paragraph three to four sentences.

**Fix:** Merge two, split one, leave one at a single sentence.

### S03 · markdown-leakage

**Cue:** Headers, bullets, or bold inside text destined for an email, a comment, a chat message,
or continuous prose.

**Why:** Models default to structured output because training corpora are markdown-dense. The
tendency predates RLHF and survives explicit instructions to suppress it.

**Fix:** Convert structure back to sentences. Ask where the text is going before deciding.

### S04 · section-symmetry

**Cue:** Three or more sections of near-equal length under grammatically parallel headings.

**Fix:** Let the important section run long. Compress the others. Real coverage is uneven.

### S05 · resolution-ending

**Cue:** A closing paragraph that restates the preceding content and resolves it.

**Fix:** Delete it and reread. If nothing was lost, it stays deleted.

### S06 · flat-affect

**Cue:** Uniform confidence and uniform enthusiasm throughout. No passage where the writer is more
or less interested than elsewhere.

**Fix:** Only applies to authored text with a point of view. Let emphasis land unevenly. Do not
manufacture opinions the user does not hold.

---

## Quick reference

```
BAN        W01 em-dash            W02 rule-of-three      W03 negative-parallelism*
           W04 copula-avoidance   W05 significance       W06 ing-tail
           W07 ai-vocabulary      W08 inline-header      W09 title-case
           W10 chatbot-artifact   W11 sycophancy         W12 drama
           W13 aphorism           W14 promotional
           S01 sentence-variance  S02 paragraph-variance S03 markdown-leak
           S04 section-symmetry   S05 resolution-ending  S06 flat-affect

LIMIT      W20 elegant-variation  W21 hedging            W22 signposting
           W23 vague-attribution  W24 challenges-closer  W25 boldface
           W26 false-range        W27 passive-drift

FLAG       W40 curly-quotes       W41 emoji-bullet       W42 heading-skip
           W43 thematic-break     W44 table-misuse       W45 hyphen-pair
           W46 placeholder

* W03: the rhetorical forms ("not just X but Y", "it's not X, it's Y") are
  banned. The "X rather than Y" variant is limit 1 per 400 words. See W03.
```
