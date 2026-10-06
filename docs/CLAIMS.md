# Claims register

Task J8, 2026-10-05. Draft for the owner's attorney: `[OWNER]` attorney
review of this register is a Phase 2 gate (architecture 9.6, FTC Act
Section 5 row), and the register is read again at the Phase 2 copy audit.
Every rule here is copied from the architecture record with its section;
none is a legal conclusion of its own. The register exists because a
privacy promise on a public page is a claim the FTC Act holds the product
to (9.6: "every privacy claim on a public page traces to a row in sections
9 to 11, and a claim that cannot be traced is removed"), and because a
health claim can turn wellness software into a medical device (9.6, FDA
row).

Three parts: what the product may and may not say; every privacy claim the
home page and the two policy pages make today, with the row that backs it
and the test that enforces it; and the review step a copy change passes.

## 1. What the product may say

### 1.1 Wellness only

The product is general wellness software (9.6, FDA device software row).
Its copy describes estimates from what a person logs, and nothing else.
The allowed vocabulary:

- Estimates, "likely", "around", "give or take", "from your logged
  dates": the words of the 13.10 templates.
- "Tidefern gives estimates from what you log. It does not provide medical
  advice, diagnosis or treatment, and is not a form of birth control. Talk
  with your doctor or midwife before making health decisions." This is
  the footer on every prediction surface (13.10) and the sentence `/terms`
  already carries.
- "An estimate from your logged dates. Not a form of contraception." on
  every fertile-window element (9.6, FDA row; 13.10).

### 1.2 The prediction templates, by reference

Every prediction, estimate and nudge uses the wording in the table at the
end of architecture 13.10 and no other: the estimate from three or more
cycles, the first guess, the not-enough-regular-cycles case, ovulation and
fertile days, the footer, the deviation nudge. A new situation gets a new
row in that table first, then copy.

### 1.3 The only care copy

Two sentences point a person toward care, and they are the only two:

- Pointing to care: "This is worth mentioning to your doctor or midwife."
- Milestones: "Most children do this by [age]. This is not a screening
  tool; your pediatrician is."

Nothing else in the product tells a person what a symptom, a cycle length,
a measurement or a milestone means for her health or a child's.

## 2. What the product may not say

Each line names the section that forbids it.

| Never say or imply                                                                                                                      | Why (section)                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| That fertile or non-fertile days are contraceptive advice, or that the product prevents pregnancy, in any wording                        | 9.6 FDA row: 21 CFR 884.5370 makes contraception software a class II device; two products hold that authorization and Tidefern does not                                                              |
| That the product helps a person conceive, plans conception, or treats or diagnoses infertility                                          | 9.6 FDA row: no conception-planning or infertility claims anywhere                                                                                                                                  |
| That the product detects or confirms a pregnancy                                                                                        | 9.6 FDA row: no pregnancy-detection claims                                                                                                                                                          |
| That an estimate is a diagnosis, a screening, a medical opinion or a reason to act without a clinician                                  | 13.10 footer and the milestone line; section 1.3 above                                                                                                                                              |
| Any reading of a symptom, a cycle length, a mood or a measurement beyond the deviation nudge and the two care sentences                 | 13.10: the templates are the only wording                                                                                                                                                           |
| "HIPAA compliant", or any HIPAA wording                                                                                                 | 9.6 HIPAA row: generally does not apply; nothing is built for it                                                                                                                                    |
| "End-to-end encrypted", "we cannot read your data", "zero knowledge"                                                                    | 9.2: deliberately not end-to-end; the API decrypts with the person's key after `can()` approves; Vercel processes plaintext in memory (9.5)                                                         |
| "Anonymous", or that the product holds no personal data                                                                                 | `/privacy` lists the account data held; 9.1 logs a keyed HMAC of the user id                                                                                                                        |
| That data is never stored, never backed up or "deleted instantly"                                                                       | 11 retention schedule: 7-day undo, Neon history ages out within 7 days, closure tombstone 30 days; 19: point-in-time restore is the backup                                                          |
| That a vendor "never sees" data, or that there are no third parties                                                                     | 9.5: five processors, each named on `/privacy`; Vercel holds the KEK and every secret                                                                                                               |
| That nothing is ever shared                                                                                                             | 8.2: a grantee sees exactly the granted categories; the honest claim is "shared only when you say so"                                                                                               |
| A privacy promise with no row in sections 9 to 11                                                                                       | 9.6 FTC Act row: it is removed, not softened                                                                                                                                                        |
| A legal fact, a contact, a date or an entity that the owner has not supplied                                                            | `docs/design/CONTENT.md`: `[OWNER]` marks, never invented                                                                                                                                           |
| A number for a retention period, a window or a deadline that differs from section 11 or 9.6                                             | The policies are written from the retention schedule and the vendor table, not aspirationally (9.6)                                                                                                 |

Questions for `[OWNER]` attorney that the record does not settle: whether
"private notes" and "a key made for you" may stay on the home page as
worded once the KEK moves to a cloud KMS at the Phase 2 gate; whether the
status line "used daily by its first household" is a claim about anything;
whether California's CMIA (9.6, other states row) changes any sentence on
`/health-privacy`.

## 3. Every public privacy claim, traced

Columns: where the claim appears; the claim as the page shows it; the
architecture row that backs it; the test that enforces it, as the spec
file and the test title, or "none yet" with the task that will add it.
"Content" in the test column means the claim is a statement of what the
schema or the record holds, which no behavior test can prove and which
the Phase 2 copy audit checks by reading.

### 3.1 The home page (`apps/web/src/components/public/home-copy.ts`)

| Where                      | Claim                                                                                                                                              | Backed by                                                                                                                                | Enforced by                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero statement             | "Shared only when you say so."                                                                                                                     | 8.2: every partner default is off; 8.3 step 3: `can()` allows a grantee only through an active grant                                     | `packages/core/src/policy.test.ts` "honors a summary grant only for summary reads"; `packages/db/src/rls.test.ts` "a foreign subject" > "gets zero rows everywhere but her own profile"; `apps/web/tests/e2e/public.spec.ts` "the home page renders the hero statement @smoke" keeps the sentence itself on the page                                               |
| Hero promise               | "Your partner sees what you choose, category by category, and you can take it back."                                                               | 8.2 categories; 8.3 step 4 serializer projection; 11 "Revoke a partner": `revoked_at` takes effect on the next request                   | `packages/core/src/policy.test.ts` "treats a revoked grant as absent"; `packages/core/src/policy-filters.test.ts` "keeps only the columns filed under granted categories, plus the keys"; `packages/db/src/rls.test.ts` "a revoked grant" > "reads zero rows from the moment revoked_at is set"                                                                   |
| Hero promise               | "Nothing watches you."                                                                                                                             | 9.1: no advertising SDKs, pixels, session replay or third-party analytics; the CSP nonce policy keeps any script from another origin out  | `apps/web/tests/e2e/home.spec.ts` "security headers and no indexing on previews" (per-request nonce, `strict-dynamic`, no `unsafe-inline`); the dependency exclusion of `@vercel/analytics` and `@vercel/speed-insights` has no gate yet (see section 4 and the requests in the pull request)                                                                     |
| Chapter "Cycles"           | "keep notes that stay yours"                                                                                                                       | 8.2: `journal.private` is never shareable; 9.2: note bodies encrypted with the subject's key                                             | `packages/core/src/policy.test.ts` "never shares the private journal"; `packages/db/src/rls.test.ts` "the private journal" > "is never visible to a grantee, whatever else she holds"; `packages/db/src/schema/platform.test.ts` "notes" > "store an encrypted body filed as private by default"                                                                  |
| Chapter "Childhood"        | "shared with every guardian and nobody else"                                                                                                       | 8.2: `child` category, guardians full, others off; a grant for child A never reaches child B (8.3 step 2)                                 | `packages/core/src/policy.test.ts` "scopes a child grant to exactly one child"; `packages/db/src/rls.test.ts` "a grant for one child" > "reaches that child and never the other"; "households and guardianship" > "show members to each other and children only to guardians"                                                                                     |
| Promise "Yours by default" | "Nothing is shared until you share it, category by category, and you can take it back."                                                            | Same rows as the hero promise                                                                                                            | Same tests as the hero promise                                                                                                                                                                                                                                                                                                                                   |
| Promise "Nothing watching" | "No third-party analytics, advertising or session recording. We keep daily counts of how the product is used, never a record of who."              | 9.1; 7.4 and `packages/db/src/schema/platform.ts`: `product_events` holds day, name and count and no user column                          | `apps/web/tests/e2e/home.spec.ts` "security headers and no indexing on previews"; `packages/api/src/middleware/logger.test.ts` "logs the allowlisted fields and nothing from the path, the query, the headers or the body"; the counter table's shape is content                                                                                                  |
| Promise "Private notes stay private" | "Notes are encrypted on our servers with a key made for you, and private notes are never shared with anyone."                                      | 9.2: a random 32-byte DEK per subject, AES-256-GCM, AAD bound to table, column and row; 8.2 `journal.private`                             | `packages/crypto/src/request-keys.test.ts` "keeps each subject's key apart and never shares a key between subjects" and "refuse a ciphertext moved to another row, column, table or subject"; `packages/db/src/rls.test.ts` "the private journal" > "accepts no note from anyone but her, even at the contribute level"                                            |
| Promise "Delete means delete" | "Closing your account deletes your data within 14 days, including from our database history. You can undo for 7 days."                          | 11 "Close account": 7-day undo, then the DEK destroyed and rows deleted; 11 retention: Neon history ages out in 7 days; 9.2 step 5         | `packages/crypto/src/provisioning.test.ts` "removes the wrapped key so nothing can unwrap it, and is harmless twice"; `packages/crypto/src/request-keys.test.ts` "a new request can no longer unwrap, so the field is unreadable"; the closure flow and the sweep: none yet, task E8                                                                              |

### 3.2 `/privacy` (`apps/web/src/app/privacy/page.tsx`)

| Where               | Claim                                                                                                                                                         | Backed by                                                                                                                          | Enforced by                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intro               | Health data is on its own page and nothing there is repeated here                                                                                             | 9.6 MHMDA row: a separate `/health-privacy` page containing only the RCW 19.373.020 items                                          | `apps/web/tests/e2e/home.spec.ts` "every public page links the health privacy policy by its required name @smoke"; `apps/web/tests/e2e/public.spec.ts` "every public page carries the health privacy link by its required name and its title" |
| Your account data   | Email, name, credentials as a hash or a passkey public key, two-step secret and backup codes, sessions with IP and browser, profile settings, "No date of birth is stored" | 7.4; `packages/db/src/auth-schema.ts` (`user`, `session`, `account`, `two_factor`, `passkey`); 8.4: adults attested, no date of birth | Content; `apps/web/tests/e2e/settings-security.spec.ts` "two-step sign-in moves from the password through the code to the backup codes shown once" and "devices lists every session as a device row, this browser first" show the two stores in use |
| Your account data   | Activity: "Sign-ins, devices, sharing changes and exports ... Never your health records."                                                                      | 8.3 step 6; `packages/api/src/middleware/audit.ts`: a name never carries a category or a fact, the columns do                      | `packages/api/src/middleware/audit.test.ts` "needs a day and a category for a read, and a known action"; `packages/db/src/rls.test.ts` "the audit log" > "takes an event only from the actor, about a subject she is related to"                  |
| Your account data   | Usage counts: daily counts, no record of who; no third-party analytics, advertising or session recording                                                       | 9.1; 7.4 `product_events`                                                                                                          | Same as the home "Nothing watching" promise                                                                                                                                                                                                       |
| Stored on your device | Four things and nothing else; no cookies beyond the two named; no cookie banner                                                                              | 9.6 other states row: no consent banner for strictly necessary storage; 13.4 theme key; 14.1 sound key; `packages/auth` two-factor cookie | `apps/web/tests/e2e/home.spec.ts` "theme follows the system on first visit and remembers an explicit choice" and "interface sound can be turned off and the choice persists" (stored only on an explicit choice); the "nothing else" half is content |
| Email we send       | Every message generic; no subject line or body ever names a health fact                                                                                        | 9.1; 10.2; 9.5 Resend row                                                                                                          | None yet: the mail templates arrive with the E tasks; the Phase 2 copy audit reads every template                                                                                                                                                 |
| Processors          | Five named processors; none may use data for anything else; none receives it to sell or advertise                                                              | 9.5 vendor table and terms; `docs/LAUNCH_RUNBOOK.md` Vendors and processors                                                        | Content (contract); `[OWNER]` attorney confirms each DPA at the Phase 2 gate                                                                                                                                                                      |
| Processors, Vercel  | Short-lived request logs that never contain health data                                                                                                        | 9.1 allowlist logging; 19: one-hour retention on Hobby                                                                             | `packages/api/src/middleware/logger.test.ts` "logs the allowlisted fields and nothing from the path, the query, the headers or the body" and "logs the route template, never the concrete id in the path"                                           |
| Processors, Neon    | Free text such as notes is encrypted before it is stored, with a key made for you                                                                              | 9.2                                                                                                                                | Same crypto tests as the home "Private notes stay private" promise                                                                                                                                                                                             |
| Processors, Resend  | Receives the email address and the generic messages, never health data                                                                                         | 9.5                                                                                                                                | None yet (with the mail templates)                                                                                                                                                                                                                |
| Processors, GitHub  | Receives no user data; the test data is synthetic                                                                                                              | 9.5; 15: CI runs against a migrated and seeded Postgres service                                                                    | Content; the seed in `packages/db/scripts/seed.ts` is the synthetic data                                                                                                                                                                          |
| Processors, Cloudflare | DNS queries only                                                                                                                                            | 9.5 (Phase 1)                                                                                                                      | Content                                                                                                                                                                                                                                           |
| How long we keep it | Account until closed, 7-day undo, history within 7 days; closure record 30 days; sessions until expiry or sign-out; invitations 72 hours; activity one year; usage counts 90 days; Resend logs per Resend | 11 retention schedule, row by row                                                                                         | The sweep that enforces the schedule: none yet, task E8; `packages/db/src/schema/platform.ts` carries the 45-day and undo columns as content                                                                                                      |
| Your choices        | Export after signing in again; close the account; requests from people without an account answered within 45 days                                              | 11 "Export", "Close account", "Requests from people without an account"; 9.6 MHMDA row (45 days)                                   | None yet for export and closure (task E8); `data_requests.deadline_at` is content; `apps/web/tests/e2e/public.spec.ts` "/account/delete shows the signed-out action without a session" covers the entry page                                       |
| Contact             | `[OWNER]` inbox and entity                                                                                                                                     | `docs/design/CONTENT.md` owner inputs                                                                                              | Not a claim until supplied                                                                                                                                                                                                                        |

### 3.3 `/health-privacy` (`apps/web/src/app/health-privacy/page.tsx`)

| Where                     | Claim                                                                                                                                         | Backed by                                                                                                        | Enforced by                                                                                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intro                     | The page is the RCW 19.373 notice and contains only what that notice must contain                                                              | 9.6 MHMDA row: only the RCW 19.373.020 items, linked from every public page by that name                         | The two footer-link tests in 3.2's first row; `apps/web/tests/e2e/home.spec.ts` asserts the H1 and the draft notice                                                                                                                 |
| What is collected and why | Four categories, each with its purpose; "for no other use"                                                                                     | 8.2 categories and the storage map; 9.6 MHMDA row: a per-category lawful basis                                   | Content; `packages/core/src/policy-filters.test.ts` "files a note or photo under the category its row carries"                                                                                                                     |
| What is collected and why | Notes encrypted with a key made for you; private notes never shared                                                                            | 9.2; 8.2 `journal.private`                                                                                       | Same as the home "Private notes stay private" promise                                                                                                                                                                                           |
| What is collected and why | The only other use is to show a granted person exactly the granted categories, which can be changed or taken back; nothing advertised or sold  | 8.3 step 4; 11 "Revoke a partner"; 9.1; 9.6 MHMDA row: no sale (19.373.070)                                      | `packages/core/src/policy-filters.test.ts` "keeps only the columns filed under granted categories, plus the keys" and "strips ended_reason and due_date_changes for any grantee"; the revocation tests in 3.1                       |
| Where it comes from       | From you and from a partner or guardian you invited; no device integration, no purchase, no inference from behavior                            | 8.2: `cycle.status` derived on read from logged rows and never stored; 13.10: estimates from what you log         | Content                                                                                                                                                                                                                            |
| What is shared            | No sale; nothing to a third party for its own purposes; people you grant see the categories you turned on, described in plain words before each can be turned on | 9.6 MHMDA row; 8.2; `grants.description_version` in `packages/db/src/schema/relationships.ts`            | The grant tests in 3.1; the plain description before a switch: none yet, task H6                                                                                                                                                   |
| What is shared            | A child's record is seen by the child's guardians                                                                                              | 8.2 `child` category                                                                                             | `packages/db/src/rls.test.ts` "households and guardianship" > "show members to each other and children only to guardians"                                                                                                           |
| What is shared            | Vercel and Neon as processors; Resend receives the address only; GitHub and Cloudflare receive no health data; affiliates `[OWNER]`             | 9.5                                                                                                              | Content                                                                                                                                                                                                                            |
| How to exercise rights    | Answered within 45 days, one 45-day extension                                                                                                  | 9.6 MHMDA row; 11                                                                                                | `data_requests.deadline_at` and its check constraints are content; the request flow: none yet, task E8                                                                                                                             |
| How to exercise rights    | Confirm and access: categories held, every processor with its contact, every grant holder; the export after signing in again                   | 11 "Confirm and access" (`GET /api/v1/me/data-summary`) and "Export"                                              | None yet, task E8                                                                                                                                                                                                                  |
| How to exercise rights    | Withdraw consent closes the account                                                                                                            | 11 "Withdraw consent"                                                                                            | None yet, task E8; `consents` in `packages/db/src/schema/relationships.ts` is content                                                                                                                                               |
| How to exercise rights    | Delete a note or entry; close the account; processors told to delete                                                                           | 11 "Delete a note or photo", "Close account"                                                                      | None yet, task E8                                                                                                                                                                                                                  |
| How to exercise rights    | Take back a grant: stops at the person's next request                                                                                          | 11 "Revoke a partner"                                                                                            | `packages/db/src/rls.test.ts` "a revoked grant" > "reads zero rows from the moment revoked_at is set"                                                                                                                              |
| If a request is refused   | Written reason; appeal decided in writing within 45 days; the Attorney General named on denial                                                 | 9.6 MHMDA row (19.373.040(1)(h)); 11 "Appeal"                                                                     | Content (a process)                                                                                                                                                                                                                |
| Contact                   | `[OWNER]` inbox, entity, attorney review date                                                                                                  | `docs/design/CONTENT.md` owner inputs                                                                            | Not a claim until supplied                                                                                                                                                                                                         |

### 3.4 Repeats on other public pages

`/terms` carries the 13.10 footer sentence word for word (section 1.1) and
`/account/delete` carries the closure paragraph (lock now, 7-day undo,
deletion, history within 7 more days, processors told), which repeats the
"Delete means delete" row. Neither page adds a claim of its own. Both are
noindex drafts: `apps/web/tests/e2e/public.spec.ts` "the drafts and the
deletion entry stay out of search".

## 4. The review step a copy change passes

A pull request that adds, changes or removes a sentence on a public page,
in an email template, in a notification or in a prediction surface does
these in order, and says so in its body.

1. Classify the sentence. A health or care sentence may only be one of the
   13.10 templates or the two care sentences in 1.3; anything else is a
   new row in the 13.10 table first, which needs the owner. A privacy
   sentence needs a row in section 3 here.
2. Check section 2. A sentence that matches any "never say" line does not
   ship, whatever the intent.
3. Trace it. Name the architecture section that already does what the
   sentence says. If none does, the sentence is removed, not softened
   (9.6, FTC Act row); the record is never changed to fit the copy.
4. Enforce it. Name the spec file and test title that would fail if the
   behavior stopped. Write the test when none exists and the behavior is
   built; when the behavior is not built yet, the row says "none yet" with
   the task id, and that task's acceptance includes the test. A test is
   never weakened to make a sentence true (AGENTS.md).
5. Update this register in the same pull request: the row's claim text
   is the page's text, so a wording change edits the row.
6. Run the gates. `pnpm check` (the prose gate refuses an em dash;
   `format:check` covers this file) and `pnpm test:e2e`, which holds the
   footer link name on every public page and the hero statement.
7. Owner inputs. A legal fact, a contact, a date or an entity stays
   `[OWNER]` until the owner supplies it; `[OWNER]` attorney review of any
   new privacy sentence before Phase 2.

Gates that do not exist yet and would make this register self-enforcing
are listed as requests in the pull request that added this file: a
dependency check that fails on `@vercel/analytics`, `@vercel/speed-insights`
or any analytics SDK in a lockfile; a check that every fertile-window
element carries its sentence once those surfaces are built; a check that
no public page sentence outside this register's section 3 uses the words
"encrypt", "share", "sell", "delete", "anonymous" or "HIPAA".
