# Evidence

What the three failure families rest on.

---

## Version staleness

The strongest evidence in this skill, and the clearest fix.

**Deprecated API usage runs 25% to 38%** across eight common Python libraries in LLM output.
*LLMs Meet Library Evolution: Evaluating Deprecated API Usage in LLM-Based Code Completion*
(ICSE 2025) attributes this to two causes that compound:

1. **Stale parametric knowledge.** The training cutoff freezes version awareness.
2. **Outdated patterns embedded in the corpus.** Public repositories contain a decade of
   historical code, so deprecated APIs are over-represented relative to their current use. A model
   can confidently recall a version that was already obsolete when it was trained.

The second cause is why "use a newer model" does not solve this. The historical corpus does not
shrink.

**Version-conditioned generation succeeds only 48% to 51%** on GitChameleon 2.0. This is the more
damning number: even when explicitly told which version to target, state-of-the-art models get it
right barely more than half the time. Prompting your way out does not work.

*When LLMs Lag Behind: Knowledge Conflicts from Evolving APIs in Code Generation*
(arXiv 2604.09515) frames this as a temporal-misalignment problem inherent to static training on
an evolving ecosystem. *APILOT* (arXiv 2409.16526) approaches it by routing generation around
known-outdated APIs; *Towards Knowledge Alignment in Code LLMs* (arXiv 2606.30810) and
*Lightweight Model Editing for LLMs to Correct Deprecated API Recommendations*
(arXiv 2511.21022) attempt to patch the parametric knowledge directly.

All of these approaches converge on the same conclusion, which is the rule in this skill:
**resolve, do not recall.** A registry lookup is one request and is correct by construction. The
model's memory is free and wrong 25% to 38% of the time.

`dependencies.md` gives the endpoints. The Node case is the cleanest illustration of the user-
visible failure: `nodejs.org/dist/index.json` carries an explicit `lts` field on every release, so
"which Node LTS should I use" has a deterministic answer that takes one fetch, and a model
answering from memory names whichever LTS was current during training.

---

## Security patterns

**Roughly half of generated code carries a detectable OWASP Top-10 vulnerability.** The most
modern models produce secure code about 55% of the time. Reported non-compliance with basic
secure-coding standards, or triggering of CWE-classified weaknesses, ranges from 12% to 65%
depending on task and model.

**Missing input sanitization is the single most common flaw**, and it holds across languages and
across models. That is why B01 leads the file.

Supporting work:

- *Guiding AI to Fix Its Own Flaws: An Empirical Study on LLM-Driven Secure Code Generation*
  (arXiv 2506.23034) finds models can fix vulnerabilities given a hint or fine-grained feedback,
  but do not avoid them unprompted. This is precisely what a checklist supplies.
- *Security Weaknesses of Copilot-Generated Code in GitHub Projects* (arXiv 2310.02059)
  identified **18 distinct code smells including two security smells** in real merged code, not
  benchmark tasks.
- *An Investigation into Misuse of Java Security APIs by Large Language Models*
  (arXiv 2404.03823) documents systematic misuse of cryptographic APIs specifically, which is the
  basis for B03. Cryptography is where confident-and-wrong is most expensive.
- *Security Vulnerability Patterns in AI-Generated Code: A Cross-Model Comparative Study*
  (arXiv 2607.20713) confirms the patterns hold across model families rather than being an
  artifact of one vendor.

At scale: AI-generated code was introducing **over 10,000 new security findings per month as of
June 2025**, roughly a tenfold increase over December 2024. The per-snippet rate is not
improving quickly; the volume is growing.

The mechanism is the same one behind stale versions. Training data includes Stack Overflow answers
from 2013, tutorial code that skips validation for brevity, and repositories that were never
reviewed. Models inherit the flaws along with the idioms.

---

## Visual convergence

Less formally measured, well documented in practice.

The mechanism is the clearest of the three. Asked for "modern" or "clean" with no operational
constraint, a generator produces on-distribution output: the highest-frequency patterns associated
with polished product screenshots in its training data. Every wave of generated UI therefore
converges on the same median.

The convergent set is consistently reported as: Inter or Roboto, purple-to-blue gradients on
white, centered hero sections, three-column card grids with rounded corners, glassmorphism, neon
glows, and blurred background orbs. `frontend.md` lists these with the specific class names and
hex values to search for, because at that level of specificity the tells are greppable.

Note the parallel to prose. F07's three-column grid is the same pull that produces the rule of
three in generated writing: triples read as complete, so a next-token optimizer converges on them
regardless of whether there are three things.

The proposed remedies in practice are structural rather than corrective: design tokens, style
guides that define approved typography and spacing scales, pre-approved blocks to assemble rather
than generate, and a `DESIGN.md` carrying tokens plus stated anti-patterns. That is why
`frontend.md` ends by telling you to look for an existing design system and follow it. Matching an
established system beats generating a better one.

F12 is the exception in that file and is not an aesthetic finding at all. Fabricated testimonials,
customer logos, and metrics are false factual claims about the world. They fall under the same
no-fabrication rule as inventing citations in prose, and no design preference authorizes them.

---

## Sources

- *LLMs Meet Library Evolution: Evaluating Deprecated API Usage in LLM-Based Code Completion* —
  ICSE 2025
- *When LLMs Lag Behind: Knowledge Conflicts from Evolving APIs in Code Generation*, arXiv 2604.09515
- *APILOT: Navigating Large Language Models to Generate Secure Code by Sidestepping Outdated API
  Pitfalls*, arXiv 2409.16526
- *Towards Knowledge Alignment in Code LLMs: Contrastive Unlearning for Evolving APIs*, arXiv 2606.30810
- *Lightweight Model Editing for LLMs to Correct Deprecated API Recommendations*, arXiv 2511.21022
- *VersiCode: Towards Version-controllable Code Generation*, arXiv 2406.07411
- *Guiding AI to Fix Its Own Flaws: An Empirical Study on LLM-Driven Secure Code Generation*, arXiv 2506.23034
- *Security Weaknesses of Copilot-Generated Code in GitHub Projects: An Empirical Study*, arXiv 2310.02059
- *An Investigation into Misuse of Java Security APIs by Large Language Models*, arXiv 2404.03823
- *Security Vulnerability Patterns in AI-Generated Code: A Cross-Model Comparative Study*, arXiv 2607.20713
- OWASP Top 10
- *Fixing Visual AI Slop: Front-End Design Standards and Skills for AI Coding Agents* — Trilogy AI
