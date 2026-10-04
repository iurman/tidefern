# Focused website workflows

Use only the selected section and relevant shared references. Apply the shared intake and scope rules from `SKILL.md`. Completion means implementing and verifying the requested result, except for a report-only audit.

## Redesign

Use for a visual refactor of an existing site. Establish whether the target is the entire site or named page families. Capture representative current layouts and inventory the routes, customer actions and shared patterns being preserved.

Preserve approved logo geometry, verified business facts, functioning integrations, URLs and SEO intent unless the request changes them. Preserve supported themes and stack by default. Existing content can be rewritten within verified facts; new fonts and colors are appropriate when the brief opens those decisions.

Use [research-and-skills.md](research-and-skills.md) for relevant actual examples and [design-and-motion.md](design-and-motion.md) for composition. Choose a direction that changes hierarchy, layout, rhythm and media integration to meet the brief. Do not label a palette/font swap a full redesign. Reuse existing research where it answers the current question.

Render one representative page early in the supported themes at desktop/mobile sizes. Review the actual result before rolling the shared language through the scoped routes. Implement the complete requested scope while preserving customer behavior. Shared changes require checking their consumers, including routes outside the visual brief when affected.

Update existing tokens, design chapters, inventories and relevant project records. Creating a new six-route reference or adding a missing theme is not automatic in this mode; do so when included in the requested deliverable. Verify the affected page families, navigation, media, accessibility and route metadata with [verification-and-release.md](verification-and-release.md). Deliver before/after evidence and meaningful checks.

## Refine

Use for a named page, section, component, copy improvement or responsive defect. Identify the target, desired outcome, existing states and consumers. Inspect the reported viewport/theme first, then its responsive equivalents. Reproduce a concrete bug before choosing a fix.

Use existing design tokens and component conventions. Research a few relevant live patterns only when the design problem needs alternatives; a clear spacing or clipping defect does not need a gallery tour. A page redesign can use the composition guidance without redefining the whole brand.

Inspect whether the cause belongs in a shared component, layout/container or one instance. Fix shared defects at the source and inspect affected consumers. Keep intentional page-specific differences in an explicit variant or local composition instead of leaking global overrides. Avoid unrelated cleanup.

Inspect image fit, edges, spacing and wrapping at the affected sizes. Exercise relevant focus, keyboard, pointer/touch, expanded/error and theme states. Add regression coverage when it protects a real behavior or failure case, not merely a changed CSS value.

Update the corresponding existing specimen and usage guidance if a documented pattern changes. Do not create new pages, themes, branding or a documentation application solely to finish a local refinement. Deliver the local result with affected-view evidence and checks proportionate to the change.

## Motion

Use for a named effect or interaction. Identify the intended states, trigger, entry/idle/exit behavior and interruption cases. Preserve appearance and layout for a behavior-only request. Reproduce the issue in actual animated frames rather than judging only the settled screenshot.

Use the navigation/motion guidance in [design-and-motion.md](design-and-motion.md). Investigate timing, geometry, containing blocks, rendering snapshots and lifecycle ownership as relevant. Choose the simplest adequate renderer; do not add a library just to signal animation quality.

Inspect entry into idle for a pause or velocity jump. Exercise rapid reversals, scroll/navigation, resizing, hidden tabs, offscreen behavior and reduced motion. Verify visible pixel changes and viewport anchoring, not merely timers. Controls must match their actual behavior; do not automatically add playback controls to decorative branding.

Update the existing motion chapter with the actual shared renderer when present. Build an isolated tuning playground only for a substantial custom effect that benefits from one. Keep experiments separate from shipped defaults. Deliver frame evidence and relevant behavior/lifecycle checks.

## Design system

Use to create or synchronize inspectable documentation, tokens, specimens and exports. Inventory the actual shipped patterns and determine which chapters or exports the request covers. Read [design-reference.md](design-reference.md).

For an existing reference, fill the requested coverage gaps using real production components. For a new reference, use the six-chapter structure unless the brief or repository calls for another structure. Documentation work does not authorize a visual redesign of customer pages.

Check catalog entries against real source paths and unique fragments. Exercise previews, copy/download controls and validated imports; ensure sandbox changes cannot mutate production defaults. Verify exported tokens match the source, and read the guidance against current behavior. Report actual coverage and remaining gaps rather than counting links as proof of completeness.

## Audit

Use for visual, copy, accessibility, performance, search/social or release-readiness review. Determine the named concerns, routes and environments. An audit without a request to fix produces findings; it does not silently change the application. If the user asks to fix issues, complete verified corrections within that scope and recheck them.

Read only relevant sections of [verification-and-release.md](verification-and-release.md). SEO/social work examines rendered initial HTML, canonical/indexing behavior, sitemap routes, HTTP responses and image validity. Performance work records test conditions and separates lab measurements from field data. Visual/motion work needs browser evidence and actual states.

Prioritize reproducible issues by impact with location, evidence, cause when established, and a concrete correction. Separate observed failures from recommendations and unavailable checks. Do not generate a new visual direction, documentation suite, social assets or a public release merely because they appear elsewhere in this skill. If fixes are requested, update existing reference material only where the shipped pattern changes.
