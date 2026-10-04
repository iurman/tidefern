# Full build

Use for a complete new website or an explicitly requested end-to-end rebuild. A redesign of an existing site can instead use the narrower [redesign workflow](focused-work.md#redesign).

## Establish the site

Complete the shared intake in `SKILL.md`. Read README, planning documents, manifests and application code. Establish the company, audience, real services/products, positioning, evidence, contact destinations and intended domain. Separate consulting inquiries from product journeys when useful. Choose a small stack for an empty repository; preserve a suitable existing stack.

Inspect approved logo variants visually. If no identity exists, develop an appropriate identity without presenting it as previously approved. Start the progress checkpoint immediately.

## Choose and render a direction

Use [research-and-skills.md](research-and-skills.md) to inspect actual relevant library entries, live interactions and mobile behavior. Record retained observations, URLs, evidence and access limits in `docs/design/RESEARCH.md` or equivalent. Stop once there is enough evidence to render a direction.

Use [design-and-motion.md](design-and-motion.md) to consider distinct compositions and compare plausible fonts beside the actual identity. Record the page map, each page's visitor question/action, responsive composition, tokens, imagery and motion in `docs/design/DESIGN.md`.

Render the first screen and a representative interior page early. Inspect desktop/mobile in the intended themes before applying the design everywhere. Fix visible problems first. A font and palette change alone is not a complete visual direction.

## Complete implementation

Build the justified page map with substantive content, navigation, footer, customer actions and applicable loading/empty/error states. Add service, product and work pages when real content supports them. About should explain the company. Add backend behavior only when required, with honest configuration and failure states. Never simulate a successful integration or publish draft policies as operative agreements.

Provide light and dark themes with dark as the initial default unless the brief or accepted product specifies otherwise. Use semantic tokens and apply remembered choices before paint.

Build the interactive reference alongside production components using [design-reference.md](design-reference.md). The default full-build deliverable includes `/design`, `/design/brand`, `/design/color`, `/design/type`, `/design/components` and `/design/motion`. Respect exclusions, existing route conventions and product boundaries. Keep machine-readable exports and examples synchronized with the real site.

## Verify and hand off

Apply [verification-and-release.md](verification-and-release.md) across the complete site, including customer copy, browser behavior, supported themes, motion, performance, SEO/social metadata and deployment artifacts when relevant. Track findings and corrections in `docs/design/QA.md`. Reinspect affected views after fixes.

Finish `docs/LAUNCH_RUNBOOK.md` with setup, environment, provenance/licenses, integration limitations, deployment/indexing, rollback and precise remaining inputs. Use equivalent existing documentation when appropriate. Save coherent local commits as appropriate to the task and repository.

Deliver a working preview, design-reference links, actual desktop/mobile screenshots and recorded checks. Publication remains subject to existing user authorization. If authorized, use the reference's publication procedure, including remote SHA and actual public verification; a source push alone does not prove deployment success.
