# Evidence

Why each tier is enforced the way it is, and what the claims rest on.

---

## The mechanism

Language models sample from a distribution over next tokens. Alignment training sharpens that
distribution toward responses rated highly across a wide range of prompts. The result is prose
optimized for the median case, which no individual writer occupies.

Wikipedia's WikiProject AI Cleanup states it plainly: LLMs "use statistical algorithms to guess
what should come next. The result tends toward the most statistically likely result that applies
to the widest variety of cases."

This is why the tells are distributional. Nothing in a triple or an em dash is wrong. The signal
is that they appear at rates no human sustains.

It also sets the limit of what this skill can do. Removing tells moves text off the machine
centroid. It does not move it toward any particular person. That requires the `voice-profile`
skill.

---

## Tier HIGH

### Em dashes (W01)

*The Last Fingerprint: How Markdown Training Shapes LLM Prose* (arXiv 2603.27006) tested twelve
models across five providers under a multi-condition suppression experiment. Two findings drive
the `ban` default:

1. **Rates vary by an order of magnitude across providers**, from 0.0 per 1,000 words (Llama) to
   9.1 (GPT-4.1). A marker that varies this much between models but stays high within one is
   a fingerprint of training procedure.
2. **Suppression fails selectively.** Instructed to drop markdown, models dropped headers,
   bullets, and bold. Em dashes survived in most models. Explicit prohibition still failed in
   some.

The paper's explanation is markdown leaking into prose: the em dash is what remains of structural
formatting once the visible structure is stripped. The tendency predates RLHF.

Corroborating: em dash frequency in scientific abstracts more than doubled between 2021 and 2025,
tracking the adoption curve of AI writing tools.

**Why `ban` rather than `limit`.** Human baselines vary too widely to set a universal limit, and
the cost of removing an em dash is near zero because every function it serves has a clean
substitute. When a user's actual rate is known, `calibration.md` converts the ban into their
measured limit. The ban is the no-information default, not a claim that em dashes are bad.

### AI vocabulary (W07)

Lexical markers are the most-studied family. Style words including *delves*, *underscores*,
*showcases*, *pivotal*, *intricate*, *meticulously*, and *realm* spiked sharply through 2023 and
2024. At least **13.5% of 2024 PubMed abstracts** show LLM lexical fingerprints (Kobak et al.,
*Science Advances* 2025, arXiv 2406.07016, across 15M+ abstracts).

The era segmentation in `tells.md` matters and is underused. WikiProject AI Cleanup tracks the
vocabulary by period because it drifts as models are retrained. The 2023 set now reads dated
rather than merely artificial, and a skill that only bans *delve* misses everything current. The
mid-2025-onward set is smaller and less conspicuous, which makes it more useful as a detector and
more important to cut.

*Benchmark of stylistic variation in LLM-generated texts* (arXiv 2509.10179) and *StyleDecipher*
(arXiv 2510.12608) both find lexical and stylistic features sufficient for robust detection,
supporting enforcement at the word level rather than only the document level.

### Structural and content patterns (W02 through W06, W08, W09, W14)

Sourced from **Wikipedia: Signs of AI writing**, maintained by WikiProject AI Cleanup. This is the
strongest available catalogue for one reason: it is maintained against live cleanup work at scale
rather than derived from a fixed corpus. Editors identify patterns while removing them from real
articles, and the guide is revised as the patterns change.

It is also the source blader/humanizer draws on, and it is the right source. Where this skill
differs is in adding the era segmentation, the structural tier, and calibration.

The guide's own category structure maps onto the tiers here: content patterns (significance
inflation, promotional register, superficial `-ing` analyses, vague attribution, formulaic
challenges sections), language and grammar (AI vocabulary, copula avoidance, negative
parallelisms, rule of three, elegant variation), and style (title case, boldface, inline headers,
em dashes, emoji).

The guide also documents per-model citation-markup residue, reproduced verbatim in W10. Those
strings are not stylistic tells; they are unambiguous evidence of a paste, and warrant deletion
with no judgment call.

---

## Tier STRUCTURAL

This tier is the main addition over existing humanizer skills, and the evidence for it is strong.

**StoryScope: Investigating idiosyncrasies in AI fiction** (Russell et al., University of Maryland
and Google DeepMind; arXiv 2604.03136) built a 304-feature pipeline across ten narrative
dimensions and reached **93.2% macro-F1 on human-vs-AI detection** and 68.4% on six-way authorship
attribution. A 30-feature subset captured most of the signal.

Two conclusions carry over:

1. **AI narratives cluster in a shared stylistic region while human authors spread out.** The
   detection signal is homogeneity, not any single defect. This is the direct justification for
   S01, S02, S04, and S06: variance is the target, and uniformity is the tell.
2. **Discriminative features sit well above the word level**, plot, pacing, character, temporal
   structure, perspective. Discourse-level features alone retain over 97% of the performance of
   models that also use stylistic cues. A humanizer working only on vocabulary is operating on a
   minority of the signal.

For S03, *The Last Fingerprint* supplies the mechanism directly. Models default to headers,
bullets, and bold because training corpora are markdown-saturated, and the structure appears
whether or not the destination renders markdown.

S01 in particular is worth the measurement. Low sentence-length variance survives every lexical
fix, and reading rhythm is what a reader notices before they can name why.

---

## Tier MEDIUM and LOW

Mostly catalogued rather than measured, which is why they default to `limit` and `flag` rather
than `ban`.

W20 (elegant variation) has a specific mechanical cause worth knowing: repetition-penalty decoding
directly penalizes reusing a token, so models cycle synonyms where a human would repeat the noun.
The guide notes this explicitly. The fix runs against instinct, since varying word choice is
taught as good style, but repeating a concrete noun is what human technical writing does.

W23 (vague attribution) is bordered by a hard constraint. The correct fix is to name the source,
and if the source cannot be established the tell stays and gets reported. Satisfying a style rule
by inventing a citation is the worst possible outcome and is prohibited by the four rules in
SKILL.md.

---

## What this skill deliberately does not do

**It is not a detector and not an evasion tool.** Detection classifiers and humanizers are not
inverses. StyleDecipher and similar systems key on distributional properties across a whole
document; text can pass a rules-based cleanup and still classify as machine-written, and text that
evades a classifier can still read as machine-written to a person. This skill optimizes for the
human reader. Any effect on automated detectors is incidental and is not claimed.

**It does not claim removing tells produces a specific voice.** Cutting the machine centroid gets
text to neutral, not to *you*. See `voice-profile` for the other half, and see that skill's
evidence file for why prompting a model with a few samples does not close the gap.

---

## Sources

- *The Last Fingerprint: How Markdown Training Shapes LLM Prose*, arXiv 2603.27006
- *StoryScope: Investigating idiosyncrasies in AI fiction*, Russell et al., arXiv 2604.03136
- *Benchmark of stylistic variation in LLM-generated texts*, arXiv 2509.10179
- *StyleDecipher: Robust and Explainable Detection of LLM-Generated Texts with Stylistic Analysis*, arXiv 2510.12608
- *Wikipedia: Signs of AI writing* — WikiProject AI Cleanup
- *Catch Me If You Can? Not Yet: LLMs Still Struggle to Imitate the Implicit Writing Styles of
  Everyday Authors*, arXiv 2509.14543, EMNLP 2025 Findings
- blader/humanizer — prior art, Wikipedia-derived, 33 rules
- jenna-russell/storyscope — StoryScope reference implementation
