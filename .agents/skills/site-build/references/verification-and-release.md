# Verification and release

Apply only checks relevant to the selected workflow and its affected consumers. Full-site loops, new social assets and launch documentation belong to a full build or the corresponding explicit scope. A report-only audit records findings without applying fixes. Repository-required checks still apply to implementation work.

Run a few focused passes and record `location | severity | evidence | correction | verification` in the project's QA log. Inspect the rendered site early and recheck affected views after a fix. Continue for concrete findings, not an invented quality score. If a fix fails twice, revisit its cause.

## Review loops

Copy: read visible and expanded text, metadata and alt text in context. Verify claims and working actions; remove filler and internal narration.

Visual: inspect every page family in its supported themes at desktop, tablet and narrow mobile widths. Include short/wide viewports, 320px reflow and 200% text enlargement where applicable. Check alignment, readable wrapping, image integration, focus/menu geometry, clipping and footer clearance. Zero horizontal overflow alone does not prove readable layout.

Behavior/accessibility: exercise links, menus, disclosures, theme persistence, forms and error paths. Test keyboard order, unobscured focus, focus return, touch targets, contrast, zoom, reduced motion and history. Combine automated checks with manual inspection. Report unavailable browsers/devices/screen readers.

Motion: inspect changing pixels and actual frame geometry through entry, idle, interruption, resizing and navigation. Test pause/zero speed where those controls exist, comparison alignment and lifecycle cleanup. A screenshot taken only after completion cannot catch a jumping fixed bar or a stalled handoff.

Performance: run a production build, inspect console/network failures and measure key routes under recorded mobile conditions. Set project-appropriate image/font/JavaScript budgets. Reserve layout space, optimize assets and profile expensive effects. Distinguish local lab scores from field performance.

Write tests at useful behavior/failure boundaries: navigation, themes, forms when present, design tools and validated transfer, errors, metadata and relevant animation. Avoid huge shallow snapshots, constant-matching assertions, fake successful integrations and coverage percentages used as proof of quality. Do not weaken tests to make a run pass. Label environment failures separately from application defects.

Run lint/types/build and appropriate tests. Repeat them when changes or unresolved concerns justify it; do not endlessly rerun unchanged green checks. Preserve evidence from the actual tested revision and conditions.

## Search, social sharing and deployment assets

Use route-appropriate titles/descriptions, canonical URLs, icons and truthful structured data. Derive sitemap routes from the content registry where possible. Exclude experiments and private/draft content. Make robots.txt, response headers and metadata agree. Keep previews out of indexing without accidentally disabling intended production indexing.

Verify the actual apex/www redirect and any environment override. Use absolute metadata/image URLs. If the public domain is unknown, document that input and keep the preview nonindexable; do not publish invented canonicals. Do not fabricate modification dates, ratings, prices or company details.

Create a readable generic social card and useful route-specific variants. Use the approved identity, short descriptors, dimensions, MIME types and alt text. Check wide, square and small crops. Inspect initial server HTML with crawler/mobile user agents, not only the hydrated DOM.

Check current primary guidance:

- https://ogp.me/
- https://developer.apple.com/documentation/technotes/tn3156-create-rich-previews-for-messages/
- Official framework, search-engine and host documentation for the chosen implementation

Request every distinct social image through HTTP. Verify successful status, content type, valid bytes, dimensions and reasonable size. Unknown IDs must produce the intended real error, not a blank successful image.

A full source checkout can conceal deployment failures. When functions render images or load files at runtime, inspect the packaged artifact for fonts, templates, images, WASM and other required assets. Use the platform's artifact/trace mechanism and a focused packaging regression check when appropriate. In Next.js, missing serverless assets may require narrowly scoped `outputFileTracingIncludes`; verify against the installed framework and generated trace rather than adding a blanket rule. Pre-rendered cards can work while on-demand cards fail. A clean build and local PNG response do not prove public runtime success.

## Handoff and publication

Record setup/build commands, runtime requirements, asset/font/skill provenance and licenses, environment variables, integration conditions, indexing/deployment steps, rollback and precise remaining inputs in the runbook. Keep business secrets out of public design resources.

Default to local delivery unless the user authorized publication. Save coherent local commits as appropriate and preserve unrelated work. If a requested external action is not authorized, complete the local result first and ask only for that concrete action. Do not treat this skill as permission to send messages, charge money or create services.

For authorized publication, verify the intended remote and branch, complete required build checks, preserve unrelated history and confirm the accepted remote SHA. Check any connected deployment status, then the actual public sitemap, canonicals/indexing, images, critical routes and configured integrations. Never describe a source push alone as a successful deployment.

Fix production-only failures within the authorized scope. Do not retry unchanged permission/configuration failures indefinitely or alter hosting/DNS/payment settings without authorization. Preserve diagnostics and report a precise external blocker when further verification requires missing access.

Record the verified application revision separately from later documentation-only receipts. External sharing caches, Search Console, real inbox delivery and physical-device previews may need separate access. State what was locally tested, publicly verified or remains untested. Do not promise identical crops/unfurls across apps.
