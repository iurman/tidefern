# Credits

Almost nothing in this repository is an original finding. The rules come from
other people's research and other people's cleanup work. This file records who,
what was taken, and under what terms.

If you think something here is credited wrongly or insufficiently, open an
issue. That is a bug, and it will be treated as one.

---

## The two starting points

Both were supplied at the outset of this project and shaped what it became.

### jenna-russell/storyscope

[github.com/jenna-russell/storyscope](https://github.com/jenna-russell/storyscope)

*StoryScope: Investigating idiosyncrasies in AI fiction*, Russell et al.,
University of Maryland and Google DeepMind, arXiv 2604.03136.

**What was taken:** a conclusion, not code or text. StoryScope showed that
discourse-level narrative features alone separate human from AI fiction at
93.2% macro-F1, retaining over 97% of the performance of models that also use
stylistic cues. That result is the entire justification for the structural tier
in `humanize-writing`, and the reason this repo argues that a vocabulary-only
humanizer works on a minority of the signal.

The related observation that AI stories cluster in a shared region of narrative
space while human stories spread out is why S01, S02, S04, and S06 target
**variance** instead of correctness.

**License:** the repository declares none, so default copyright applies. Nothing
was copied from it. It is cited for its published findings, which is ordinary
scholarly use.

**Correction made during review:** an earlier draft said "only 39 of 304
features were style features in the narrow sense." That count comes from the
feature-dimension breakdown in the repository's own README, not from the paper.
The paper's abstract makes a stronger and better-sourced version of the same
point, and the docs now cite that instead.

### blader/humanizer

[github.com/blader/humanizer](https://github.com/blader/humanizer)

The most visible prior art for `humanize-writing`, and the reason this project
did not start from a blank page. It demonstrated that a Wikipedia-derived
catalogue of AI writing tells works well as a portable agent skill.

**What was taken:** the idea and the choice of primary source. No rule text was
copied. Both projects derive from *Wikipedia: Signs of AI writing*, so overlap
in the tells themselves is convergence on a shared source rather than borrowing.

Where this repo differs: era-segmented vocabulary lists, a structural tier,
evidence grading per tell, calibration against a measured voice profile, and
coverage of code and personal voice.

**License:** reported as MIT. Confirm at the repository before reusing anything
from it directly.

---

## Primary source for the writing catalogue

### Wikipedia: Signs of AI writing

[en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
Maintained by [WikiProject AI Cleanup](https://en.wikipedia.org/wiki/Wikipedia:WikiProject_AI_Cleanup).

Roughly 30 of the ~45 tells in
`skills/humanize-writing/references/tells.md` derive from this guide. Its
category structure, its era-segmented AI vocabulary lists, and its per-model
citation-residue table are all reproduced in substance.

It is the single largest contribution to this project by volume, and it is
maintained by volunteers doing unglamorous cleanup work at scale. It deserves
top billing over any individual paper cited here.

> **License: CC BY-SA 4.0.**
>
> Wikipedia text, including project-space pages, is licensed
> [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
> The license carries a **share-alike obligation**: derivative works must be
> released under CC BY-SA 4.0 or later.
>
> `skills/humanize-writing/references/tells.md` is a derivative work of that
> guide. **That file is therefore dual-licensed, and CC BY-SA 4.0 governs the
> portions derived from Wikipedia.** The rest of this repository remains MIT.
> See [`LICENSE`](LICENSE) and the notice at the top of `tells.md`.

This was caught during a licensing review, after the file had already shipped
under MIT alone. It was the wrong license for that file and is now corrected.

---

## Research cited

Full findings in [`docs/research.md`](docs/research.md). Why each was chosen,
and what was rejected, in [`docs/sources.md`](docs/sources.md).

Every arXiv ID below is verified by `tools/check_citations.py`, which resolves
each one against the arXiv API and checks the title matches. CI runs it.

### Writing

| Work | Contribution |
| --- | --- |
| **Kobak et al.**, *Delving into LLM-assisted writing in biomedical publications through excess vocabulary*, Science Advances 2025, doi 10.1126/sciadv.adt3813, arXiv 2406.07016 | The empirical backbone of W07. 15M+ PubMed abstracts, 2010 to 2024, at least 13.5% of 2024 abstracts LLM-processed |
| *The Last Fingerprint: How Markdown Training Shapes LLM Prose*, arXiv 2603.27006 | The em dash ban and markdown leakage. 0.0 to 9.1 per 1,000 words across 12 models and 5 providers, and suppression that fails |
| *StoryScope*, arXiv 2604.03136 | The structural tier |
| *Benchmark of stylistic variation in LLM-generated texts*, arXiv 2509.10179 | Corroboration only |
| *StyleDecipher*, arXiv 2510.12608 | Corroboration only. No rule derives from it, deliberately |

### Code

| Work | Contribution |
| --- | --- |
| **Wang et al.**, *LLMs Meet Library Evolution*, ICSE 2025, arXiv 2406.09834 | 25% to 38% deprecated API usage. 7 LLMs, 145 API mappings, 8 libraries, 28,125 prompts |
| *GitChameleon 2.0*, arXiv 2507.12367 | 48% to 51% version-conditioned success. The number that decides the resolve-do-not-recall rule |
| *VersiCode*, arXiv 2406.07411 | Task definition for version-specific completion |
| *When LLMs Lag Behind*, arXiv 2604.09515 | Temporal misalignment framing |
| *APILOT*, arXiv 2409.16526 | Routing around outdated APIs |
| *Contrastive Unlearning for Evolving APIs*, arXiv 2606.30810 | Unlearning stale knowledge |
| *Lightweight Model Editing*, arXiv 2511.21022 | Patching deprecated recommendations |
| *Security Weaknesses of Copilot-Generated Code*, arXiv 2310.02059 | 18 code smells in real merged code |
| *Guiding AI to Fix Its Own Flaws*, arXiv 2506.23034 | The argument for a checklist |
| *Misuse of Java Security APIs by LLMs*, arXiv 2404.03823 | The basis for B03 |
| *Security Vulnerability Patterns in AI-Generated Code*, arXiv 2607.20713 | Cross-model confirmation |
| [OWASP Top 10](https://owasp.org/www-project-top-ten/) | Severity ordering in `backend.md` |
| *Fixing Visual AI Slop*, Trilogy AI | The frontend catalogue and the flag-do-not-fix posture |

### Voice

| Work | Contribution |
| --- | --- |
| *Catch Me If You Can? Not Yet*, arXiv 2509.14543, EMNLP 2025 Findings | Determines the entire `voice-profile` architecture |
| *How Well Do LLMs Imitate Human Writing Style?*, arXiv 2509.24930 | Supporting |
| *Guided Profile Generation*, arXiv 2409.13093 | Structured profiles over raw few-shot |
| *Authorship Style Transfer with Policy Optimization*, arXiv 2403.08043 | Supporting |
| *StyleAdaptedLM*, arXiv 2507.18294 | Cited to admit the in-context ceiling |
| *AuthorMix*, arXiv 2603.23069 | Cited to admit the in-context ceiling |
| *GhostWriter*, arXiv 2402.08855 | Personalization and agency |
| *LLMs and Forensic Linguistics*, arXiv 2512.06922 | Both sides of authorship imitation |

---

## Format and tooling

| Project | Use |
| --- | --- |
| [Agent Skills specification](https://agentskills.io/specification), Anthropic | The `SKILL.md` format this repo targets |
| [agentskills/agentskills](https://github.com/agentskills/agentskills) | Spec and reference material. No license declared |
| [AGENTS.md](https://agents.md), Linux Foundation Agentic AI Foundation | The fallback convention |
| [skills.sh](https://skills.sh) / [vercel-labs/skills](https://github.com/vercel-labs/skills) | The installer. Its strict YAML parsing caught a real bug here |
| [endoflife.date](https://endoflife.date) | EOL and LTS data for `dependencies.md` |
| [nodejs.org/dist](https://nodejs.org/dist/index.json) | The Node release index |
| npm, PyPI, crates.io, Go module proxy, RubyGems, NuGet, Packagist, Maven Central | Registry endpoints |

---

## How the citations are checked

This repository was written with model assistance, which creates a specific
risk: a model can produce a confident, plausible-looking arXiv ID for a paper
that does not exist, or attach a real ID to the wrong claim.

`tools/check_citations.py` resolves every arXiv ID against the arXiv API and
verifies the title beside it matches. It runs in CI.

**It found two real misattributions on its first run**, both in already-merged
work:

- The 48% to 51% figure was credited to **VersiCode**, whose abstract does not
  contain it. It belongs to **GitChameleon 2.0** (arXiv 2507.12367).
- The 25% to 38% figure cited a venue with no identifier. It is
  **arXiv 2406.09834**.

A third problem was found by hand: the 13.5% PubMed figure, quoted throughout,
was attributed to "lexical marker studies" and to nobody. It is **Kobak et al.,
Science Advances 2025**, and it is one of the most load-bearing sources in the
project.

All three are corrected. They are recorded here rather than quietly fixed,
because a repository that asks you to trust its citations should show what it
got wrong.
