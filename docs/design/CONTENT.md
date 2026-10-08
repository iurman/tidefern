# Content inventory

Task G2, 2026-10-05. One row per route: the visitor's question, the
content, the primary action and where it really goes, navigation placement,
indexability, metadata, and any fact the owner must supply. Copy rules are
in `humanize.md` and architecture 13.10; the prediction templates there are
the only wording predictions use. Owner inputs are marked `[OWNER]` and
never invented.

## Routes

| Route | Visitor question | Content | Primary action and destination | Navigation | Indexable | Title and description | Owner facts |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | What is Tidefern and is it for me? | Split hero (tagline, privacy statement), numbered chapters, four promises, footer | "Create an account" to `/welcome` (Phase 1: after sign-up); "Sign in" in the header | Public header, footer | Production only with `SITE_INDEXABLE=true` | "Tidefern \| Life flows together"; the brand description | None |
| `/privacy` | What happens to my account data? | Account data, device storage (session cookie, `tidefern-theme-v1`, `tidefern-sound-v1`, each with its basis and how to stop storing), email, no cookies beyond the session, the processor list from architecture 9.5, retention from section 11 | Read; "Contact" to the inbox | Footer "Privacy" | Noindex while a draft | "Privacy \| Tidefern"; "What Tidefern stores about your account and how long." | `[OWNER]` inbox address; `[OWNER]` legal entity |
| `/health-privacy` | What happens to my health data? | Only the five RCW 19.373.020 items (categories collected, sources, purposes and uses, categories shared and processors by name, how to exercise each section 11 right) plus the appeal path; marked draft | Read; request by email | Footer "Consumer Health Data Privacy Policy" on every public page | Noindex while a draft | "Consumer Health Data Privacy Policy \| Tidefern"; one sentence naming the Act | `[OWNER]` inbox, `[OWNER]` entity, `[OWNER]` attorney review date |
| `/terms`, `/accessibility` | What are the terms; how accessible is it | Drafts marked as such; the accessibility page states WCAG 2.2 AA as the target, known gaps, and how to report one | Read | Footer | Noindex | "Terms \| Tidefern", "Accessibility \| Tidefern" | `[OWNER]` legal text; `[OWNER]` contact |
| `/account/delete` | How do I delete my account? | One paragraph: what closing deletes and when (7 day undo, then deletion, Neon history within 7 days), then the signed-in entry | "Close my account" to `/settings` closure with fresh authentication | Footer, Settings | Noindex | "Delete your account \| Tidefern" | None |
| `/welcome` | How do I start? | Five steps: time zone, stage, dates, collection consent (own step, one unchecked control, categories, purposes, processors by name, the withdrawal sentence, separate terms acceptance), optional passkey | "Continue" per step; "Finish" to `/today` | None | Never | "Welcome \| Tidefern" (no stage in the title) | None |
| `/today` | Where am I today and what can I log? | Ring or week card or child summary by stage, estimate sentence, ovulation sentence with the contraception line, "How this is estimated", quick log, partner summary, week card, prediction footer | Log today (quick log card or sheet) | Tab bar and rail | Never | "Today \| Tidefern" | None |
| `/calendar` | What happened and what is expected? | Month and list views, legend, Today control | Tap a day to `/log/[date]` | Tab bar and rail | Never | "Calendar \| Tidefern" | None |
| `/log/[date]` | What do I log for this day? | Day sheet | "Save" returns to the opener | From calendar and today | Never | "Log a day \| Tidefern" (the date never in the title) | None |
| `/journey` | What week am I in and what is coming? | Week card, timeline, dating history, ending path; postpartum view | Add an appointment or milestone | Tab bar and rail | Never | "Journey \| Tidefern" | None |
| `/family` | How are the children today? | Child cards (last event, time since, today's total), guardians, add a child (with the guardian consent on the child's behalf) | Log a feed, sleep or diaper | Tab bar and rail | Never | "Family \| Tidefern" | None |
| `/family/[childId]` | What has this child done and how are they growing? | Timeline, growth charts with band and caption, milestones with the not-a-screening line, measurement entry with unit toggle | Add a measurement or milestone | From `/family` | Never | "Family \| Tidefern" (no child name in the title) | None |
| `/sharing` | Who can see what? | People with per-category switches and plain descriptions, the notify switch, pending invitations, invite, the sentence that private notes are never shared | Invite a partner; change a category | Tab bar and rail | Never | "Sharing \| Tidefern" | None |
| `/settings` | How do I change things about me and my account? | Profile, time zone and units, theme with follow system, sound level and quiet hours, notification detail with the lock-screen preview and the generic-email sentence, devices, export, close account | Save a setting | Tab bar and rail | Never | "Settings \| Tidefern" | None |
| `/activity` | What happened on my account? | Audit rows: sign-ins, devices, grants given and revoked, partner contributions, exports; cursor paginated; no health content | Load more | From Settings | Never | "Activity \| Tidefern" | None |
| `/design` and chapters | How is Tidefern built? | Seven chapters from real components and tokens, exports | Read, copy, download | Public header, footer | Never (noindex and outside the sitemap) | "Design system \| Tidefern" and chapter titles | None |

Titles never carry a stage, a date, a child's name or any health word.

## Voice

| State | Rule | Example |
| --- | --- | --- |
| Pending | Say what is happening, keep the control's width | "Saving", "Sending the invitation", "Checking your passkey" |
| Failure | Say what to do next, never only that something failed | "That email is already in use. Sign in instead." / "We could not save this day. Try again." / "The invitation has expired. Send a new one." |
| Empty | Say what would be here, why it is not, and the one action | See the table below |
| Success | Short, with the undo where one exists | "Saved for Sunday, Oct 5. Undo" / "Alex can now see your cycle status." |
| Destructive | Name the consequence and the undo window | "Closing your account locks it now and deletes it in 7 days. Signing in again before then cancels this." |

Page titles in Title Case, everything else in sentence case. Second person,
active voice, numerals for numbers. No em dashes anywhere. Predictions use
the templates in architecture 13.10 word for word.

## Empty states

| Surface | Heading | Why | Action |
| --- | --- | --- | --- |
| `/today`, cycle stage, no log yet | Nothing logged yet | Log your last period start and Tidefern can place you in your cycle. | Log a period |
| `/today`, after a pregnancy ended | When you are ready | Predictions are paused until a period is logged. | Log a period when it comes |
| `/calendar` month | Nothing logged this month | Days you log show here with their flow and symptoms. | Log today |
| `/calendar` list | Nothing logged yet | Days you log show up here as a list you can scan. | Log today |
| `/journey`, no pregnancy | No pregnancy recorded | Start one with a due date or your last period and this becomes week by week. | Start a pregnancy |
| `/journey`, postpartum | Predictions are paused after birth | When your first period comes, log it and Tidefern starts again from there. | Log a period |
| `/family` | No child added yet | Add a child to keep feeds, sleep, growth and milestones in one place. | Add a child |
| `/family/[childId]` growth | No measurements yet | Add a weight or length and the chart draws the percentile band around it. | Add a measurement |
| `/family/[childId]` milestones | Nothing marked yet | Most children do these by the ages shown. This is not a screening tool; your pediatrician is. | Mark a milestone |
| `/sharing` | You are the only one who can see this | Invite a partner and choose exactly what they see, category by category. | Invite a partner |
| `/activity` | No activity yet | Sign-ins, devices and sharing changes appear here. | (none) |
| Devices in `/settings` | Only this device | Other signed-in browsers and phones appear here so you can sign them out. | (none) |

## Sharing descriptions (the plain words before a category can be turned on)

| Category | What it reveals |
| --- | --- |
| Cycle status | Which day of your cycle it is and whether Tidefern estimates a fertile window today. Not your symptoms, not your notes. |
| Cycle history | Your past periods, cycle lengths and the next period estimate. |
| Symptoms | The symptoms and moods you log on any day, in any stage. |
| Pregnancy overview | The week, the due date, appointments and milestones. Never why a pregnancy ended, never your notes. |
| Pregnancy photos | Photos you add to the journey (Phase 2). |
| A child | Everything logged for that child: feeds, sleep, growth, milestones and photos. One switch per child. |
| Private notes | Never shared. There is no switch. |

The notify switch reads "Tell [name] when my period starts" with the
sentence "The message says only that there is something new in Tidefern."

## Prediction and care copy

The eight templates in architecture 13.10 (estimate, first guess, not
enough regular cycles, ovulation and fertile days, the footer, the deviation
nudge, pointing to care, milestones) are the only wording those surfaces
use. The short disclaimer under the estimate sentence on `/today`
(`RESEARCH.md` decision 6) reuses the tail of the ovulation template, "An
estimate from your logged dates. Not a form of contraception.", so no new
wording enters; the compositions in `DESIGN.md` show it. The full footer
still closes the page.

## Context ranges on `/family` (proposed, `[OWNER]`)

Task F6. `infantContext(kind, dateOfBirth, today)` in `packages/core`
returns the published range for a child's age, its band and its sources;
`packages/core/data/SOURCES.md` quotes the sentence behind each figure. A
line that states a range names a health norm, so every line below is a
proposal: `[OWNER]` approves it, then it becomes a row in the architecture
13.10 table before it ships (`docs/CLAIMS.md` sections 1.4 and 4). Until
then the UI shows a plain placeholder marked `[OWNER]` where the line goes.
The wording follows the sources: AAP's "should have" becomes "expected",
AASM's recommendations become "recommended", and each source's "at least",
its 24-hour basis, AASM's "on a regular basis" (usual sleep, not one day's)
and whether naps count are kept as the source has them.

| Range id | Proposed line `[OWNER]` | Source line `[OWNER]`, linking to the source's `url` |
| --- | --- | --- |
| `feed-newborn` | "Expected for a newborn: at least 8 to 12 feeds every 24 hours." | "Source: American Academy of Pediatrics" |
| `wet-diaper-first-days` | "Expected in the first few days after birth: 2 to 3 wet diapers a day." | "Source: American Academy of Pediatrics" |
| `wet-diaper-after-first-days` | "Expected after the first 4 to 5 days: at least 5 to 6 wet diapers a day." | "Source: American Academy of Pediatrics" |
| `sleep-4-to-12-months` | "Recommended at 4 to 12 months: 12 to 16 hours of sleep every 24 hours on a regular basis, naps included." | "Source: American Academy of Sleep Medicine" |
| `sleep-1-to-2-years` | "Recommended at 1 to 2 years: 11 to 14 hours of sleep every 24 hours on a regular basis, naps included." | "Source: American Academy of Sleep Medicine" |
| `sleep-3-to-5-years` | "Recommended at 3 to 5 years: 10 to 13 hours of sleep every 24 hours on a regular basis, naps included." | "Source: American Academy of Sleep Medicine" |
| `sleep-6-to-12-years` | "Recommended at 6 to 12 years: 9 to 12 hours of sleep every 24 hours on a regular basis." | "Source: American Academy of Sleep Medicine" |
| `sleep-13-to-18-years` | "Recommended at 13 to 18 years: 8 to 10 hours of sleep every 24 hours on a regular basis." | "Source: American Academy of Sleep Medicine" |

Once on the page, under the cards `[OWNER]`: "These ranges come from the
American Academy of Pediatrics and the American Academy of Sleep Medicine.
Tidefern is not affiliated with either, and neither has reviewed Tidefern."

Rules for every range line (the first two from architecture 8.4, the rest
from the sources and the decisions `SOURCES.md` records):

- It sits beside today's count as context. Nothing about the card changes
  with where the count falls: no color, icon, badge, sound or haptic, and
  no "too few", "too many", "low", "high", "normal", "on track" or
  "behind". A count outside a range never brings up the pointing-to-care
  sentence.
- No line where the function returns nothing: no sleep line before 4
  months, no feed or wet diaper line after the first month.
- The figures are per 24 hours, and the sleep figures are for sleep on a
  regular basis, not one day's; today's count is the day so far, so the
  line states the range and never compares the two.
- Feeds count breast and bottle feeds; solids are not part of the figure.
  Wet diapers count diapers logged as wet or mixed.
- The source line names the publisher and links to its page, never with a
  logo.

## Owner inputs still missing

- `[OWNER]` the inbox for privacy and health data requests (every policy
  page and the appeal path).
- `[OWNER]` the legal entity name and address line, if any, for the
  policies.
- `[OWNER]` attorney review of both policies, the terms and the consent text
  (Phase 2 gate).
- `[OWNER]` approval of the mark, which the home page and the brand chapter
  present.
- `[OWNER]` the updated date each policy page shows (`/privacy`,
  `/health-privacy`, `/terms`, `/accessibility`), set when the page is
  approved; the pages show the marker until then.
- `[OWNER]` the legal text of `/terms` (governing law, liability, warranty,
  disputes), after attorney review; the page says it is missing.
- `[OWNER]` the contact for accessibility reports on `/accessibility`, if it
  differs from the privacy inbox.
- `[OWNER]` the version label of the terms the onboarding consent records
  beside the consent (`TERMS_VERSION` in `packages/schemas/src/profile.ts`,
  `2026-10` until the terms text is approved); it changes whenever the terms
  text does.

One subsection per page route below, so each route's builder adds its own
lines without touching another's.

### `/welcome` (H1)

(none yet)

### `/today` (H2)

- `[OWNER]` the day-logging strings Today's open card shares with the day
  sheet (tasks G9 and G9b): the list under `/calendar` and `/log/[date]`
  below is the one inventory for both routes.

### `/calendar` and `/log/[date]` (H3)

The day sheet's strings (tasks G9 and G9b) are in the UI as proposed until
approved, from `components/ui/day-sheet.tsx` and
`components/day-log/copy.ts`; Today's open card uses the same ones. The
saved line follows the success example above ("Saved for Sunday, Oct 5.")
and "We could not save this day. Try again." is the failure example, so
neither is repeated below.

- `[OWNER]` the Period switch's help line: "Logs a period day at Medium.
  Change the flow below." (G9b; it replaces G9's "One press logs a period
  day and picks Medium below; change it before you save. The same press
  takes it back.").
- `[OWNER]` the way back to no mood: a quiet "Clear" beside the mood
  selector while a mood is chosen, named "Clear mood" for assistive
  technology (G9b).
- `[OWNER]` the notes on the day: "Notes on this day", "Shared with people
  who can see your symptoms", "Shared with people who can see your
  pregnancy overview", "Added by someone you share with."
- `[OWNER]` sharing a note: "Share this note with...", "Share this note?",
  "It moves out of your private notes and is filed with your symptoms, so
  the people who can see your symptoms can read it. A shared note cannot be
  made private again, only deleted." (with "your pregnancy overview" in
  both places in pregnancy), "Share note", "Keep it private", "Sharing",
  "Save the note first, then share it.", "Note shared."
- `[OWNER]` deleting a shared note: "Delete this note", "Delete this
  note?", "It is removed for you and for everyone who can read it, and it
  cannot be brought back.", "Delete note", "Keep it", "Deleting", "Note
  deleted."
- `[OWNER]` undoing a save: "Changes undone for Sunday, Oct 5.", "We could
  not undo every change. Check this day and change it back.", "Undoing".
- `[OWNER]` the failures: "We could not load this day. Try again.", "Your
  session has ended. Sign in again, then come back to this day.", "This day
  was changed somewhere else. Try again to save your version.", "We could
  not save your note. Try again.", "This note was changed somewhere else.
  Try again to save your version.", "We could not share this note. Try
  again.", "This note changed somewhere else. Check it, then share it
  again.", "This note was already shared somewhere else.", "This note was
  deleted somewhere else.", "We could not delete this note. Try again."

### `/journey` (H4)

(none yet)

### `/family` (H5)

- `[OWNER]` attorney review of the guardian's consent on a child's behalf,
  the draft text the add-a-child form shows in full before its box
  (`CHILD_CONSENT_DISCLOSURES`, version 2026-10, in
  `packages/schemas/src/profile.ts`), with the other consent texts (Phase 2
  gate).
- `[OWNER]` approval of the range lines, source lines and attribution in
  "Context ranges on `/family`", and the attorney's answer on quoting the
  AAP and AASM (`docs/CLAIMS.md` section 2).

### `/sharing` (H6)

(none yet)

### `/settings` (H7)

(none yet)

### `/activity` (H8)

- `[OWNER]` approval of the activity wording below, written to the voice
  table for task H8 (`apps/web/src/app/(app)/activity/copy.ts`): the row
  sentences, the two fallbacks, the meta description, and the pending and
  failure lines.

A row says what happened, who did it and the day it happened in the
profile's zone. It may name a category by its label from the sharing
descriptions, in lower case, and never says what was viewed, written or
logged. An action without a line here reads "Other activity on your
account", never its code.

| Action | What happened |
| --- | --- |
| `session.sign_in` | Signed in |
| `session.revoke` | Signed out elsewhere |
| `grant.create` | Started sharing [place] |
| `grant.update` | Changed sharing for [place] |
| `grant.revoke`, her own sharing | Stopped sharing [place] |
| `grant.revoke`, a grantee's access ending | Ended access to [place] |
| `partner.read` | Viewed [place] |
| `partner.write` | Contributed to [place] |
| `note.share` | Shared a note with people who can see [place] |
| `invitation.create` | Sent an invitation |
| `invitation.withdraw` | Withdrew an invitation |
| `invitation.accept` | Accepted an invitation |
| `export.create` | Requested a copy of your data |
| `account.close` | Asked to close your account |
| `account.close.undo` | Cancelled closing your account |

One `session.revoke` row stands for one device signed out or for every
other device at once, and the log keeps no count, so its line names none.

[place] is "your symptoms" for her own records, "Noor's symptoms" for a
person the page can name, and "the symptoms someone shared with you" for
one it cannot. A child is "Sol's records" only for a guardian, and "a
child's records" for anyone else. Who did it reads "by you", "by Theo",
or "by someone you shared with" for a person no longer listed (a removed
partner) or without a name.

Meta description: "Sign-ins, devices and sharing changes on your Tidefern
account." Load more: pending "Loading" (no wider than the button's own
label), a failed page "We could not load more activity. Try again.", no
answer at all "We could not reach Tidefern. Check your connection and try
again.", and a failed first page "We could not load your activity just
now. Reload the page to try again."
