# Calibration

Defaults in this skill are strict because most text has no owner. When text does have an owner,
their actual habits outrank the defaults.

Resolution runs in three layers. Later layers override earlier ones.

```
1. Skill defaults          (tells.md)
2. Voice profile           (measured from the user's real writing)
3. Preference file         (explicitly stated by the user)
```

A user who genuinely writes with em dashes should not have to configure anything. Layer 2 handles
that from evidence. Layer 3 exists for cases where the user wants something other than what they
measurably do.

---

## Layer 2: voice profile

Look for an installed voice profile skill, in this order:

```
./.agents/skills/voice-*/SKILL.md
~/.agents/skills/voice-*/SKILL.md
~/.claude/skills/voice-*/SKILL.md
```

If one exists, read its **Measured rules** section. It contains observed rates for the same tells
this skill enforces. Apply them like this:

| Profile says | Effect on this skill |
| --- | --- |
| A measured rate for a tell | That rate becomes the `limit`, replacing the default |
| Rate is effectively zero | Keep `ban` |
| Rate is above the default limit | Raise the limit to the measured rate, not higher |
| Tell is absent from the profile | Keep the default |

Worked example. Profile reports `em-dash: 2.1 per 1000 words (observed across 340 samples)`.
`W01 em-dash` moves from `ban` to `limit 2 per 1000`. You still cut the sixth em dash in a
600-word draft, because six is above the user's own rate. You stop cutting at one.

Two guards on this:

- **Sample size.** Below 30 user-authored samples, treat measured rates as advisory and stay
  within one step of the default. A single email is not a style.
- **Never inherit a tell from machine text.** If the profile was built from transcripts, the
  harvest should already have excluded model output. If you have reason to think it did not,
  ignore the profile and say so in the report.

The profile also carries a **Register map**. Match the register before applying rates. Someone's
commit messages and their blog posts are different voices, and applying the commit-message rate to
an essay is worse than applying the default.

---

## Layer 3: preference file

Look for `humanize.md` in this order and use the first one found:

```
./humanize.md
./.agents/humanize.md
~/.agents/humanize.md
```

Format is a flat markdown list. It is meant to be edited by hand.

```markdown
# humanize preferences

## Tells
- em-dash: limit 1 per 500 words
- rule-of-three: ban
- hedging: allow
- signposting: flag
- ai-vocabulary: ban

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

### Grammar

Each tell line is `<id-or-name>: <level>`.

Accepts either the ID (`W01`) or the readable name (`em-dash`). Names are the ones in the quick
reference at the bottom of `tells.md`.

Levels:

| Level | Syntax | Meaning |
| --- | --- | --- |
| ban | `ban` | Reduce to zero |
| limit | `limit N per M words` | At most N per M words |
| limit | `limit N` | At most N in the whole text |
| flag | `flag` | Report only, do not change |
| allow | `allow` | Ignore entirely |

Group aliases, for convenience:

```
- all-high: ban          # every HIGH tier tell
- all-medium: flag       # every MEDIUM tier tell
- all-structural: ban
```

Specific IDs override group aliases regardless of line order.

### Style keys

| Key | Values | Effect |
| --- | --- | --- |
| `contractions` | `always` / `never` / `match-source` | Contraction handling |
| `oxford-comma` | `yes` / `no` | Serial comma |
| `register` | `casual` / `neutral` / `formal` | Shifts word choice, not tell enforcement |
| `max-sentence-length` | integer | Hard cap in words |
| `paragraph-target` | integer | Target sentences per paragraph, varied around |
| `emoji` | `allow` / `ban` | Overrides W41 |

### Never touch

Free-text list. Anything described here is excluded from every pass. Honor it literally. If an
entry is ambiguous, exclude generously and note the interpretation in the report.

---

## Reporting calibration

Say which layers were active. One line, before the findings table.

```
calibration: defaults + voice-isaac (412 samples) + ./humanize.md
```

```
calibration: defaults only (no profile or preference file found)
```

When a layer changed an outcome, mark the affected row.

```
TELL        LEVEL              N   ACTION
em-dash     limit 2/1000 [vp]  6   cut to 2 (profile rate 2.1/1000, not banned)
hedging     allow [pref]       5   KEPT: humanize.md sets hedging to allow
```

Use `[vp]` for a voice-profile override and `[pref]` for a preference-file override. A user
should be able to see at a glance why a tell survived.

---

## Conflicts

- **Preference file contradicts the profile.** Preference file wins. It is an explicit statement
  of intent; the profile is an inference.
- **Preference file contradicts the four rules in SKILL.md.** The four rules win. No preference
  file authorizes inventing facts or dropping information.
- **Two preference files exist** at different paths. First match wins, per the search order. Do
  not merge. Mention which one you used.
- **Profile exists but the text is clearly not the user's register.** Use defaults. A user writing
  a formal RFP does not want their Slack voice applied. Say so in the report.
