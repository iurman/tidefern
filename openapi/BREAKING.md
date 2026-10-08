# Approved breaking changes to the v1 contract

Architecture 5.1 keeps `/api/v1` additive, because installed clients keep
calling it for months, and the `oasdiff` step in `.github/workflows/ci.yml`
fails a pull request on any error-level change to `openapi/v1.json`. A
change listed in this file passes that step: the file is the step's
`err-ignore` input, and oasdiff ignores an error only when one line here
holds its method, its path and its whole description, so every other
breaking change still fails.

Only the lead adds a line, dated, naming the task and why no installed
client can break. Phase 1 has no installed client: the web app is deployed
together with the API from the same commit, so a change no deployed code
calls breaks nobody. From the first installed client on, the record's rule
applies without exception: a breaking change means `/api/v2`.

- 2026-10-06, task E12: in API POST /api/v1/children added the new required request property `guardianConsent`. Nothing called the route before this change (apps/web had no caller), and from now on the guardian's consent on the child's behalf is written in the same transaction as the child.
- 2026-10-07, task H6: in API PUT /api/v1/sharing/grants/{personId} request property `descriptionVersion` was restricted to a list of enum values. Only the web app calls the route, deployed from the same commit, and it sends the current key of the sharing descriptions catalog.
