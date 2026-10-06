# Incident runbook

Task J8, 2026-10-05. Draft for the owner's attorney: nothing in this
document has been reviewed by counsel, and every legal statement in it is
copied from the regulation row in `docs/ARCHITECTURE.md` section 9.6 and
the incident outline in section 19, not from the statutes themselves.
`[OWNER]` attorney review of the whole document, against the current text
of 16 CFR part 318 and RCW 19.373, is a Phase 2 gate. Until that review,
the plan is still what the person on call follows, because the alternative
is improvising at 2 a.m.

This is written to be followed at 2 a.m. by one tired person. Each phase
says who decides, what to do, in what order, and what to write down. Marks
of the form `[OWNER]` are facts only the owner can supply (a name, an
address, a phone number, a plan tier); they are never invented, and the
runbook says what to do when one is still blank.

## 0. Before anything: the roles and the log

| Role                 | Who                                                                                                                                                                                   | Decides                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Incident lead        | `[OWNER]` (the owner, until a second person is named)                                                                                                                                 | Everything in the first hour; whether to move from contain to assess; whether to call the attorney                                              |
| Attorney             | `[OWNER]` attorney (name, phone, email)                                                                                                                                               | Whether the facts meet a notice threshold; the final text of every notice; whether any rule beyond the ones in 9.6 applies                      |
| Second pair of hands | `[OWNER]` (the other adult in the household, if willing)                                                                                                                              | Nothing alone; reads this runbook aloud, keeps the time log, repeats the lead's commands back                                                   |
| Vendors              | Vercel, Neon (Databricks, Inc.), Resend, GitHub, Cloudflare, as listed in `docs/LAUNCH_RUNBOOK.md` under Vendors and processors (that table names no support contact yet); `[OWNER]` the account-level support contact for each | Only their own systems                                                                                                                          |

The incident log. Open a new file in the owner's private store (`[OWNER]`
the password manager vault or the private incident repository; never this
repository, which is public, and never the product database, because
nothing about a person belongs in a log line, architecture 9.1). Name it
`incident-<YYYY-MM-DD>.md`. The first line is the discovery time with its
time zone and the UTC equivalent. Every action below gets one line: time,
who, what, result. This log is the evidence that the burden of proof in
318.4(c) asks for, so it is written as things happen, not reconstructed.

Discovery time matters more than anything else written in the first hour:
the 60 calendar days in section 4 count from it. Write it down before
reading further.

## 1. The first hour: contain

The lead decides. Contain means stop the thing that is happening; it does
not mean understand it. Pick the row that matches what was seen and do
every step in it. When two rows match, do both. When none matches, do the
last row.

| What was seen                                                                                                                                                                 | Mechanism in the repository or a vendor console                                                                                                                             | Steps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A session, cookie or sign-in secret may be exposed (a leaked `BETTER_AUTH_SECRET`, a stolen device that stayed signed in, a session token in a screenshot)                    | `BETTER_AUTH_SECRET` rotation (`docs/LAUNCH_RUNBOOK.md`, Secret rotation: "every session signs in again")                                                                   | 1. Vercel, project, Environment Variables, production scope: replace `BETTER_AUTH_SECRET` with `openssl rand -base64 32`. 2. Redeploy production. 3. Confirm the person's own session is gone (`/today` sends to sign in). 4. For one person only, instead: Settings, Devices, the "Sign out N other devices" action on her account, or as the owner `DELETE FROM "session" WHERE user_id = '<id>'` in the Neon SQL editor on the production branch                                                                                                                                                                                                                                                                                                                                                        |
| The database credential may be exposed (`DATABASE_URL` in a log, a laptop, a pasted screenshot; a Neon API key leaked)                                                        | `tidefern_app` password rotation (runbook row); the role is `NOBYPASSRLS` so it can never read across subjects, but it reads everything one actor may                       | 1. Neon SQL editor on every branch that serves an app: `ALTER ROLE tidefern_app PASSWORD '<new>'`. 2. Update `DATABASE_URL` in Vercel for that environment; redeploy. 3. If the owner role or a Neon API key leaked: Neon console, reset the owner role's password and revoke every API key; update `DATABASE_URL_UNPOOLED`. 4. To stop the application reading the database at all while assessing: `ALTER ROLE tidefern_app NOLOGIN` (the site answers errors until `LOGIN` is granted again)                                                                                                                                                                                                                                                                                             |
| The key encryption key may be exposed (`TIDEFERN_KEK_V1` seen anywhere outside Vercel's production scope and the owner's escrow)                                              | KEK versioning and the re-wrap job (architecture 9.2 step 6; runbook row `TIDEFERN_KEK_V<n>`)                                                                               | 1. Treat every plaintext column as exposed already (9.6: plaintext is unsecured under the Rule); treat every encrypted field as exposed too, because a KEK plus a database copy reads them. 2. Add `TIDEFERN_KEK_V2` in Vercel (32 random bytes, base64), escrow it in the password manager at once, deploy, run the re-wrap job, then retire `V1` after every history window that could hold keys wrapped under it. 3. Per-user DEK rotation follows for every subject (9.2 step 6: "only after a suspected compromise"; this is that case)                                                                                                                                                                                                                                                 |
| The job runner or logs may be reachable (`CRON_SECRET` or `LOG_HMAC_SECRET` exposed)                                                                                          | Rotation in Vercel plus redeploy (runbook row); `/api/internal/jobs/run` answers 404 while `CRON_SECRET` is unset (17.1)                                                     | 1. To stop every job at once: unset `CRON_SECRET` in production and redeploy. 2. Rotate both secrets and redeploy when ready. A rotated `LOG_HMAC_SECRET` breaks the link between old and new actor hashes in logs; note the rotation time in the incident log                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| A vendor key may be exposed (`RESEND_API_KEY`, a Vercel token, a GitHub token, the Cloudflare account)                                                                        | Each vendor's own console; the GitHub secret `VERCEL_AUTOMATION_BYPASS_SECRET` (runbook, Vercel step 4)                                                                     | 1. Revoke the key at the vendor first, then replace it in Vercel or GitHub, then redeploy. 2. For the bypass secret: regenerate in Vercel, update the GitHub secret; earlier deployments become unreachable to the smoke workflow, which is fine. 3. Check every account for 2FA and hardware keys (architecture 19, supply chain) while in each console                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Health data reached the wrong person: a partner saw a category she was not granted, a child record crossed to another child, a note was visible to anyone but its author      | Grant revocation (`grants.revoked_at` takes effect at the next request, architecture 11); Vercel Instant Rollback; a revert pull request on `main`                           | 1. Stop the exposure first: as the owner in the Neon SQL editor on production, after `SET ROLE neon_superuser;` (section 2 step 2 says why), `UPDATE grants SET revoked_at = now(), updated_at = now() WHERE grantee_id = '<id>' AND revoked_at IS NULL` for the person who saw too much, or for every grant on the subject. Write in the log that this revocation bypassed the API, so no `grant.revoke` audit row exists for it. 2. If a deployment caused it: Vercel, Deployments, Instant Rollback to the previous production deployment. The runbook's Rollback section says what that costs (only the immediately previous deployment; the production domain stops moving until "Undo Rollback"; `deploy-verify` fails loudly on purpose). 3. If the cause is older than one deployment, the only mechanism in the repository is a revert pull request on `main` through CI; there is no feature flag (see the requests in the pull request that added this file). 4. Do not touch `audit_events` |
| Health data appeared where it never may: a URL, a log line, an email subject, a page title, a job name (9.1)                                                                  | Allowlist logger (`packages/api/src/middleware/logger.ts`); Vercel log retention (one hour on Hobby); Resend's email log                                                     | 1. Stop the surface: rollback or revert as above. 2. Capture the offending output once for the log, then stop looking at it. 3. On Hobby the Vercel copy expires within the hour; on Pro `[OWNER]` export the logs the same day (section 19). 4. If it went out by email, open the Resend log for the message and record its id; the message body sits at a processor now                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Something else, or not sure                                                                                                                                                   | The whole site                                                                                                                                                              | 1. Pause the Vercel project (the pause action in the project dashboard, or the REST call `POST /v1/projects/<project id>/pause` with a Vercel token; `[OWNER]` confirm on the account which of the two is available before an incident). The site answers nothing until it is unpaused. 2. Then work down this table once the cause is clearer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

After the row is done, write the time the exposure stopped. Nothing in
containment waits for the attorney; everything in notification does.

## 2. The first day: preserve evidence

Preserve before assessing, because assessing changes nothing and
containing already changed things. The durable record is the database
(section 19: Hobby keeps runtime logs for one hour and has no drains).

1. Freeze the database state. Neon console: create a branch from
   `production` at the discovery timestamp, named `incident-<date>`,
   exactly as the runbook's restore rehearsal does. The branch holds live
   wrapped keys and real data: it is deleted when the attorney releases it,
   and the deletion date goes in the log. Run every query below on that
   branch, not on production.
2. Run the owner role in the SQL editor. The application role cannot read
   across subjects, and the tables force row level security on their
   owner too, so the owner's console role needs `SET ROLE neon_superuser;`
   first (architecture 7.2). Note in the log that this was done and by
   whom.
3. Save every result as a CSV in the incident folder, named by the query
   number below, with the time it was run. These files hold ids, dates and
   categories, which are health data: they live only in the private store
   and are deleted at the review's end, with the date logged.

Queries. Replace `<from>` with the earliest time the cause could have
existed (a deployment time, a key's creation date) and `<to>` with the
containment time.

```sql
-- Q1. Every partner read in the window, one row per actor, subject,
-- category and day (the dedupe key collapses them, audit.ts).
SELECT id, actor_id, subject_id, category, child_id, occurred_at
FROM audit_events
WHERE action = 'partner.read' AND occurred_at BETWEEN '<from>' AND '<to>'
ORDER BY occurred_at;

-- Q2. Every partner write and grant change in the window.
SELECT id, actor_id, subject_id, action, category, child_id, occurred_at
FROM audit_events
WHERE action IN ('partner.write', 'grant.create', 'grant.update', 'grant.revoke')
  AND occurred_at BETWEEN '<from>' AND '<to>'
ORDER BY occurred_at;

-- Q3. The grants that existed in the window, with their lifetimes, so each
-- Q1 row can be matched against a grant that covered its category then.
SELECT id, owner_id, grantee_id, category, level, child_id,
       created_at, revoked_at, deleted_at
FROM grants
WHERE created_at <= '<to>' AND (revoked_at IS NULL OR revoked_at >= '<from>')
ORDER BY owner_id, grantee_id, category;

-- Q4. Reads with no covering grant: the rows that decide whether a
-- policy bug disclosed anything (section 3, question 3).
SELECT a.id, a.actor_id, a.subject_id, a.category, a.child_id, a.occurred_at
FROM audit_events a
WHERE a.action = 'partner.read'
  AND a.occurred_at BETWEEN '<from>' AND '<to>'
  AND NOT EXISTS (
    SELECT 1 FROM grants g
    WHERE g.grantee_id = a.actor_id
      AND g.category::text = a.category::text
      AND CASE WHEN a.child_id IS NOT NULL THEN g.child_id = a.child_id
               ELSE g.owner_id = a.subject_id AND g.child_id IS NULL END
      AND g.created_at <= a.occurred_at
      AND (g.revoked_at IS NULL OR g.revoked_at > a.occurred_at)
  )
ORDER BY a.occurred_at;

-- Q5. Sessions alive in the window: which devices and addresses were
-- signed in, for the "who could have acted" question.
SELECT id, user_id, ip_address, user_agent, created_at, expires_at
FROM "session"
WHERE created_at <= '<to>' AND expires_at >= '<from>'
ORDER BY user_id, created_at;

-- Q6. The daily counters: sign-in failures, 5xx counts and job outcomes
-- by day, the only operational record that survives Hobby's log window.
SELECT day, name, count
FROM product_events
WHERE day BETWEEN date '<from>' AND date '<to>'
ORDER BY day, name;

-- Q7. Keys: which KEK version wraps each subject and whether anything
-- rotated in the window.
SELECT subject_id, kind, kek_provider, kek_version, created_at, rotated_at
FROM subject_keys
ORDER BY created_at;

-- Q8. Jobs that failed or died in the window, with their type; the
-- payload holds ids only (architecture 10.1), never content.
SELECT id, type, status, attempts, last_error, run_after, updated_at
FROM jobs
WHERE updated_at BETWEEN '<from>' AND '<to>' AND status <> 'done'
ORDER BY updated_at;

-- Q9. Open rights requests and their clocks, so the incident does not
-- make a 45 day deadline slip unnoticed (architecture 11).
SELECT id, user_id, kind, state, requested_at, deadline_at, undo_until
FROM data_requests
WHERE state NOT IN ('completed', 'cancelled', 'refused')
ORDER BY deadline_at;

-- Q10. How many people, for the thresholds in section 4: accounts,
-- children, and people without an account whose email is stored.
SELECT count(*) AS accounts FROM "user";
SELECT count(*) AS children FROM children WHERE deleted_at IS NULL;
SELECT count(DISTINCT lower(invitee_email)) AS invitees FROM invitations;
```

Q4 note for whoever adapts it: `grants.category` and
`audit_events.category` are different enum types in the schema; the text
cast compares their labels. A child read is matched by `child_id`, not by
owner: the audit row's `subject_id` is the child, while the covering
grant's `owner_id` is the guardian who granted it, so an adult read is
matched on `owner_id` with no `child_id`. If Q4 errors, run Q1 and Q3 and
match by hand; the match is the evidence, not the query.

4. Vercel. On Pro, export the runtime logs for the window the same day
   (section 19) into the incident folder. On Hobby there is nothing to
   export after an hour; record that the plan tier made the export
   impossible, which is itself a finding for section 5. Save the list of
   deployments with their commits and times from the Vercel dashboard.
5. GitHub. Save the `deploy-verify`, `ci` and `uptime` run pages for the
   window (the run URLs are enough; the logs hold no user data).
6. Resend. If email is involved, save the message ids and the delivery
   events from the Resend log; do not forward the messages anywhere.
7. Vendor notices. If a vendor told us about an incident on their side,
   save their notice with its receipt time; which time starts the 60 days
   is for `[OWNER]` attorney (section 3, question 6).

## 3. The first week: assess

The lead works the questions with the second pair of hands; the attorney
gets the answers, not the raw files, unless they ask. Write each answer in
the log with the query or document that supports it. "We do not know" is
an answer, and under 318.2 it is the worst one: unauthorized access is
presumed to be acquisition unless reliable evidence rebuts it. The
evidence that can rebut it is what section 2 preserved.

1. What happened, mechanically? One sentence. A credential left the place
   it belonged; a deployment showed the wrong rows; a vendor was breached;
   a device was lost; a person did something they were not granted.
2. Which data could the mechanism reach? Use the storage map in
   architecture 8.2 and the two tiers in 9.2:
   - Plaintext columns: dates, flow, controlled-vocabulary codes, moods as
     codes, stage, due dates, child measurements, ids, grants. These are
     unsecured under the Rule (9.6), so a copy of them is a breach of
     unsecured health information without further analysis.
   - Encrypted fields: note bodies, journal entries, captions, free-text
     descriptions, appointment details. A copy of the ciphertext without
     the KEK is outside the Rule's unsecured category (9.6). A copy with the
     KEK, or a leak through the running application, which holds plaintext
     in memory (9.5), is inside it.
   - Account data: email, name, session addresses and browsers. Whether it
     is health data on its own is for `[OWNER]` attorney; it is still
     personal, and still part of the notice.
3. Was it acquired, or only accessible? Three cases:
   - A `can()` or RLS bug: Q4 lists partner reads with no covering grant.
     Each row is a disclosure of that category to that actor on that day
     (9.6: "a `can()` or RLS bug that showed a partner an ungranted
     category" is a breach). Zero rows in Q4, with Q1 and Q3 matching by
     hand, is reliable evidence against acquisition for that path. A bug
     in a serializer (8.3 step 4) that projected a field from another
     category is not visible in `audit_events`, because the read itself was
     granted; for that case the evidence is the code and the deployment
     window, and the presumption stands for every grantee who read in it.
   - A vendor: what each receives is fixed in 9.5 (Vercel everything in
     memory and the secrets; Neon the database with free text encrypted;
     Resend addresses and generic mail; GitHub nothing personal; Cloudflare
     DNS). The vendor's own notice says what left; our contribution is the
     list above of what that vendor could have held.
   - A credential: the row in section 1 says what the credential reads.
     Neon's query history and the session table (Q5) are the only records
     of whether it was used; without them, the presumption stands.
4. Who is affected? Count the people whose data the mechanism could reach,
   by subject: the owner of each row, every child (a child's data entered
   by a parent is the child's consumer health data, 9.6), and every
   grantee whose grant rows or notes were exposed. The count decides the
   thresholds in section 4. Q10 counts accounts, children and stored
   invitee addresses separately; their sum is the ceiling, and an invitee
   who later made an account is counted twice.
5. Where do they live? The product stores a time zone and no address
   (profile settings, `/privacy`), so the "500 or more residents of one
   state" media threshold cannot be computed from the database.
   `[OWNER]` attorney: how residency is established for that threshold when
   no address is held; until answered, assume the count applies to the
   state the household is in when the people affected are the household.
6. When was it discovered? The time at the top of the log. If a vendor
   notice arrived earlier than anyone read it, `[OWNER]` attorney decides
   which time counts.
7. Did anything else break a promise on a public page? Check
   `docs/CLAIMS.md`: every row whose claim the incident falsified is a
   section 5 item, because the FTC Act row in 9.6 ties promises to
   behavior.

Decision at the end of the week, written in the log and sent to the
attorney: health data was or was not acquired or disclosed; by which path;
for how many people; discovered when. The attorney decides whether a
notice duty exists; the lead prepares the notices in parallel so no day of
the 60 is lost waiting.

## 4. Notify

The attorney decides whether, the lead decides how fast, and the deadlines
below are the latest, never the target. All of them are copied from the
HBNR row in architecture 9.6 and the incident outline in section 19, and
`[OWNER]` attorney confirms each against the current rule before the first
notice goes out.

| Who                                                                         | When                                                                                                                            | How                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Each person affected                                                        | Without unreasonable delay and within 60 calendar days of discovery                                                             | By email where the person chose email (9.6). Every Tidefern account has an email address that was confirmed at sign-up; `[OWNER]` attorney confirms that this counts as choosing email, and names the fallback where it does not. The subject line stays generic (9.1: no health fact in an email subject); the body carries the notice below. Sent through Resend, one message per person, never a list |
| The FTC                                                                     | At the same time as the individuals when 500 or more people are affected; otherwise within 60 days after the calendar year ends | `[OWNER]` attorney supplies the submission route and keeps the receipt                                                                                                                                                                                                                                                                                                                                   |
| Prominent media                                                             | When 500 or more residents of one state are affected                                                                            | `[OWNER]` attorney supplies the outlets and the wording; the content is the same five elements                                                                                                                                                                                                                                                                                                           |
| A parent or guardian for a child                                            | With the individuals; `[OWNER]` attorney confirms this duty                                                                     | The notice about a child goes to each guardian of record (the guardianship rows, section 8.2), as the child's data is the child's                                                                                                                                                                                                                                                                        |
| Processors                                                                  | Where a processor contract requires it (9.6: 19.373.060) or where the processor needs to act (delete a message, rotate a key)   | Through the vendor contact in the runbook; record the time and the ticket id                                                                                                                                                                                                                                                                                                                             |
| People without an account whose email is stored (invitees, former partners) | With the individuals, if their stored email was exposed; `[OWNER]` attorney confirms this duty                                  | Same notice, to the stored address                                                                                                                                                                                                                                                                                                                                                                       |

The Washington act's own duties that 9.6 names and that an incident touches:
the 45 day clock on every rights request keeps running during the incident
(Q9 lists the open ones; whether the incident is a ground for the one
extension is for `[OWNER]` attorney); access responses must still list
every third party with a contact (19.373.040(1)(a)); processors are bound
by contract (19.373.060) and told to delete at closure; security practices
(19.373.050) are what section 5 reviews; and a violation is a per se
Consumer Protection Act violation with a private right of action
(19.373.090), which is why the attorney reads every notice before it goes.
9.6 names no separate Washington breach-notice duty; `[OWNER]` attorney
says whether one applies in addition to the HBNR.

### 4.1 The notice to a person: fill-in letter

The five elements are the ones section 19 lists for 16 CFR 318.6: what
happened and when, the data types, the steps the person can take, what we
are doing, and two ways to reach us. `[OWNER]` attorney compares this list
with the current text of 318.6 before use and adds any element the rule
names that this list does not. Replace every bracket; delete nothing
unbracketed without the attorney's approval. Plain words, no reassurance
that the facts do not support.

Subject: An important notice about your Tidefern account

Dear [first name as the profile shows it],

We are writing because something happened to information Tidefern holds
about you, and you have the right to know exactly what.

What happened and when. On [date and time, with the time zone] we
discovered that [one plain sentence: what went wrong, in the mechanism's
own words, for example "a change to the app let a person you had granted
one kind of record see another kind for part of a day"]. It began on or
about [date the cause started] and was stopped on [date and time the
exposure ended]. [If a vendor: name the vendor as in the processor list on
the Privacy page and say what their notice to us said.]

What information was involved. [List only the types the assessment
found, in the words the Consumer Health Data Privacy Policy uses, for
example "cycle dates and flow", "pregnancy appointments", "a child's
measurements", "your email address". Say which were encrypted and whether
the key was involved. If notes were involved say so plainly.] [If the
answer differs for a child's record, say so and name the child as the
guardian would.]

What you can do. [Steps that apply, for example: sign in and check who
holds a grant and take back any you do not want; change your password;
turn on two-step sign-in at Settings, Two-step sign-in; sign out other
devices at Settings, Devices; delete any entry or note you no longer want
kept; ask us for the full record of what was seen. Update these screen
names to the ones that exist when the notice is sent.] You can also close your account at any time; the page at
[production origin]/account/delete explains what that deletes and when.

What we are doing. [What was contained and how; what evidence was kept;
the fix and when it shipped; the test added so it cannot recur; what was
rotated; whether the FTC or anyone else has been told.] We will write
again if anything above changes.

How to reach us. Email [OWNER inbox address for privacy and health data
requests, the same one the policy pages name] or [OWNER second method:
a postal address, a telephone number, or a web form; the record names no
second method yet, and the rule requires two]. We answer within [the 45
days the policy promises, or sooner; OWNER attorney].

[OWNER legal entity name and address line, as the policy pages show it]

### 4.2 Recording that notices were sent

The burden of proof that notice was given is on the vendor (318.4(c)), so
the record is kept as if it will be read by someone who doubts it.

1. The notice register is a table in the incident file with one row per
   recipient: the subject id (never the email in the register, the
   address is in Resend's log), the channel, the time sent, the Resend
   message id, the delivery event and its time, and the version of the
   letter sent. For the FTC and the media the row holds the submission
   receipt or the published notice and its date.
2. The exact text of every version of the letter is saved beside the
   register, with the attorney's approval time for each.
3. Resend's email log is a processor's record and ages out per Resend's
   retention (section 11): copy the message id and delivery events into
   the register the same day, do not rely on Resend holding them.
4. A bounced or undelivered notice gets a second attempt by the fallback
   the attorney named, and that attempt gets its own row.
5. The register, the letters and the receipts are kept for `[OWNER]`
   attorney's retention period; the record names none, so until one is
   set, they are kept with the incident file and never in this repository
   or the product database.
6. Nothing about a notice is written to `audit_events` or
   `product_events`: a notice is not a product action, and a counter named
   after an incident would be a log line that carries a fact about people.

## 5. Review

Within two weeks of the last notice, or of the decision that none was due,
the lead writes the post-incident review. It is the only incident document
that may enter this repository, and only after every id, date and personal
detail is removed; the full version stays in the private store.

The write-up has these sections, in this order:

1. Summary: three sentences, what happened, who was affected, what was
   told to whom.
2. Timeline: from the earliest the cause existed, through discovery,
   containment, each assessment answer, each notice, to the fix. Times with
   zones. Taken from the incident log, not from memory.
3. Root cause: the mechanism, and the control that should have caught it
   (a test, a gate in `pnpm check`, RLS, `can()`, a vendor contract, a
   setting) and why it did not.
4. What the evidence showed: for each question in section 3, the answer
   and the file that supports it; where the presumption in 318.2 stood
   because evidence was missing, say what record would have rebutted it
   and whether the product can keep that record without breaking 9.1.
5. The fix: the pull request, the test it added (a test that protects the
   real behavior, never one weakened to pass), and the date it reached
   production per `deploy-verify`.
6. Rotations done: every secret from section 1 that was rotated, with the
   time, and every one that was considered and not rotated, with the
   reason.
7. Promises: the `docs/CLAIMS.md` rows the incident touched, and whether
   each claim stayed true, was corrected on the page, or was removed. A
   claim that cannot be traced is removed (9.6, FTC Act row).
8. Records: the architecture record sections that need a change (9.3
   threats, 9.5 vendors, 9.6, 19), and the pull request that makes it.
9. Costs of the plan tier: anything that Hobby's one-hour logs, one
   concurrent deployment or rollback-to-previous-only made slower or
   impossible, as input to the Pro decision in 9.5.
10. Cleanup: the date the `incident-<date>` Neon branch was deleted, the
    date the CSV files were deleted, and who confirmed each.

The review closes when the attorney has read it and the owner has written
"closed" with the date at the top. The next quarterly restore rehearsal
(runbook, Restore) also re-reads this runbook and runs Q1 to Q10 against
the rehearsal branch to confirm they still parse against the schema.

## Appendix A. What the record already says, for the attorney

Collected here so the attorney reads one page, with the section that holds
each statement.

- The FTC Health Breach Notification Rule applies: it covers fertility and
  symptom tracking (9.6).
- A disclosure the person did not authorize is a breach, including an SDK,
  a vendor, or a `can()` or RLS bug that showed a partner an ungranted
  category (9.6).
- Plaintext columns are unsecured under the Rule; only the encrypted free
  text is outside it in a leaked dump (9.6).
- Individuals: without unreasonable delay and within 60 calendar days of
  discovery, by email where the person chose email. The FTC: at the same
  time when 500 or more people are affected, otherwise within 60 days
  after the calendar year ends. Prominent media: when 500 or more
  residents of one state are affected. Content per 318.6: what happened
  and when, data types, steps to take, what we are doing, two contact
  methods (9.6 and 19).
- The burden of proof that notice was given is on the vendor, 318.4(c);
  unauthorized access is presumed to be acquisition unless reliable
  evidence rebuts it, 318.2 (9.6).
- Civil penalties run to $53,088 per violation (2026 figure, 9.6);
  `[OWNER]` attorney re-checks the figure.
- Washington MHMDA applies from the first consumer; a child's data entered
  by a parent is the child's consumer health data; rights requests in 45
  days with one 45 day extension; processor contracts (19.373.060);
  security practices (19.373.050); per se Consumer Protection Act
  violations with a private right of action (19.373.090) (9.6).
- HIPAA generally does not apply; COPPA does not apply as designed; the
  product makes general wellness claims only (9.6).
- The vendors and what each receives (9.5); the retention schedule (11).

## Appendix B. Owner inputs still missing

- `[OWNER]` attorney name, phone and email, and whether they take a call
  outside office hours.
- `[OWNER]` the second person on call, if any.
- `[OWNER]` the private store for incident files.
- `[OWNER]` the inbox for privacy and health data requests (the same input
  `docs/design/CONTENT.md` lists) and a second contact method for the
  notice, which the record does not name.
- `[OWNER]` the legal entity name and address line.
- `[OWNER]` the Vercel plan tier, which decides whether a log export is
  possible.
- `[OWNER]` the account-level support contact for each vendor in the
  runbook's vendor table.
- `[OWNER]` attorney: the residency question in section 3 item 5; whether
  the confirmed sign-up email counts as choosing email; whether any
  Washington breach-notice duty applies beyond the HBNR; the retention
  period for the notice register; the element list of 318.6 against the
  letter in 4.1; whether the guardian notice and the notice to people
  without an account in the section 4 table are duties; whether account data
  alone is health data (section 3 item 2); which time starts the 60 days
  when a vendor's notice arrives (section 2 step 7).
