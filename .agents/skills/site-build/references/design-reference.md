# Interactive design reference

For the full website workflow, provide these routes unless the brief excludes them or the product already has an equivalent structure. For a narrow follow-up, update the relevant existing chapter; do not expand scope into building a new documentation application.

| Route | Useful contents |
| --- | --- |
| /design | Overview, navigation, searchable pattern/source catalog and export links |
| /design/brand | Approved variants/downloads, dimensions, clear space, background rules, lockups, icons and actual social-image applications/crops |
| /design/color | Both themes when supported, semantic roles, intended pairings, live previews, contrast checking, aliases and persistence |
| /design/type | Editable text/weight, hierarchy, responsive scale, spacing, container widths, composition guidance and font provenance |
| /design/components | Real shared controls/states, navigation, media patterns, page composition/recovery, keyboard guidance and copyable examples |
| /design/motion | Actual shared effects, replay/timing or geometry controls, comparisons, reduced-motion/lifecycle behavior and implementation guidance |

One source supplies site tokens and generated JSON/CSS exports. Render production components directly in specimens. Do not make a parallel demo library that drifts from the real site. Scope specimen themes and experiments locally. A lazy same-origin site preview can demonstrate real navigation inside its own viewport, where appropriate; it must remain usable on narrow screens.

Make examples functional: controls change the actual preview, copying has honest success/failure feedback, downloads serve real files, and imports validate settings without modifying production configuration. Technical explanations belong here; credentials and private launch notes do not.

Maintain one machine-readable catalog used by the overview and exported for agents. A useful shape is a version plus pattern entries with `name`, `chapter`, `href`, `sources` and `description`. Map shipped patterns to actual documentation fragments and source paths; group related helpers instead of creating an entry for every internal function.

Verify source paths exist, fragments resolve once, exported files match their sources, and relevant states are documented. Add late changes such as screenshot framing, fixed chapter navigation, font deployment requirements or a new error state to their appropriate chapter. Existing library controls do not need to be reimplemented merely for exhaustive display.

Provide a concise public Markdown reference with token/component entry points, theme rules, usage examples and verification commands. Preserve framework-specific deployment requirements when they matter to a demonstrated component, such as on-demand social-image font assets. Use conditional guidance, not a host-specific fix on every project.

During final coverage review, compare the actual shipped component/effect inventory with the catalog and chapters. A passing link check proves reachability, not that the documentation describes the current behavior. Read and exercise the specimens as well.
