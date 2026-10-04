---
name: site-build
description: Build, redesign or refine websites with visual research and browser verification. Use for complete sites, focused page/component design, motion, interactive design references and website audits; match the workflow to the requested scope.
---

# Website build and refinement

Carry the requested website work through a verified result. Derive each project's identity from its own business and assets. Use a focused workflow when the user needs only part of the process.

## Choose the workflow

Infer the smallest workflow that fulfills the request. These are selectable modes within this skill, not separately installed skills or executable subcommands. Users may name a mode or describe the work naturally.

| Mode | Use for | Read |
| --- | --- | --- |
| `build` | A complete new website or an explicitly requested end-to-end rebuild | [Full build](references/full-build.md) |
| `redesign` | A new visual direction and composition across an existing site | [Redesign](references/focused-work.md#redesign) |
| `refine` | A named page, section, component, copy or responsive problem | [Refine](references/focused-work.md#refine) |
| `motion` | A named interaction, transition or animated effect | [Motion](references/focused-work.md#motion) |
| `design-system` | Create or synchronize the interactive design reference and exports | [Design system](references/focused-work.md#design-system) |
| `audit` | Inspect a named concern such as visual quality, accessibility, performance or SEO/social sharing | [Audit](references/focused-work.md#audit) |

Examples:

- `$site-build redesign this site, keeping the logo and working product flows.`
- `$site-build refine only the homepage hero and product selector.`
- `$site-build motion: fix the navbar transition without changing its appearance.`
- `$site-build design-system: document the components we just shipped.`
- `$site-build audit sitemap and Open Graph, then fix verified issues.`

Read the selected workflow and only the supporting guidance needed for it. Modes can combine for a concrete request, such as refining a hero and its motion. Do not run every mode in sequence. A specific target takes precedence over a broad mode label. A behavior-only fix does not invite new styling; a visual redesign does not imply a stack migration.

## Shared working agreement

Preserve accepted architecture, identity, working behavior and user preferences unless the request supersedes them. Treat dependency updates, new themes, additional routes and external publication as separate scope decisions, not automatic consequences of using this skill.

Make ordinary design and implementation decisions without repeated approvals. Ask focused questions when missing facts materially affect the offer, architecture or a working customer action, and continue independent work. Discover facts before issuing a questionnaire.

This skill grants no permission to publish, send messages, change DNS, enable tracking, create paid services or overwrite unrelated work. Follow existing authorization without asking again. Otherwise finish the local, reviewable result before requesting a concrete external action. Keep any delegation bounded and use it only when authorized; one lead owns visual direction and integration.

## Proportional intake and evidence

Read repository instructions, relevant planning/brand guidance and current progress. Inspect git status, the affected code and its shared consumers. Read manifests when implementation or dependencies are involved. Inspect the current rendered target before changing it when a baseline exists.

Establish the business facts that matter to the requested change. Separate verified facts from assumptions. Never invent testimonials, metrics, clients, pricing, experience, legal facts or working integrations. Keep customer copy direct and free of internal build narration. The user's default is no em dashes in authored copy, metadata or alt text; explicit project writing requirements take precedence.

When working with identity or imagery, visually inspect the approved assets. Preserve logo paths and proportions; do not substitute generated art or a font recreation. Reuse established research and tokens for focused changes unless they cause the problem being addressed.

For a substantial build or redesign, create or update `docs/BUILD_PROGRESS.md` immediately, or use an equivalent existing log. Record decisions, evidence, commands/results and next action. For a small change, update relevant existing records and give a concise handoff; do not create a full documentation suite. A report-only audit need not modify repository files. Resume from current git state and recorded progress after interruption.

## Supporting guidance

- [Research and skills](references/research-and-skills.md): when choosing a visual direction, comparing interaction patterns or filling a capability gap. Inspect actual library entries and demos. Missing optional skills do not block the work. Verify dependency versions from official sources when adding or changing them.
- [Design and motion](references/design-and-motion.md): the relevant composition, media, navigation, motion or copy section when implementing that work.
- [Design reference](references/design-reference.md): when creating the reference or updating documentation for a changed production pattern. Reuse real components and tokens.
- [Verification and release](references/verification-and-release.md): relevant review checks, SEO/social checks or authorized release steps. Full-site checks and launch artifacts apply to full-site work or release, not automatically to a component fix.

Inspect affected desktop/mobile views and supported themes after implementation. Test meaningful behavior and shared consumers, plus repository-required checks. Update the relevant existing design chapter when a documented pattern changes. Finish with the changed scope, actual evidence, verified results and remaining limitations. Do not claim unavailable browser, device, account or public checks.
