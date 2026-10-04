# Design records

The build writes its design evidence here. Each file has one job; keep
them current when a documented pattern changes.

| File | Written in | Holds |
| --- | --- | --- |
| `RESEARCH.md` | Stage 1 (task G1) | Retained observations from the galleries, Phloom and the product references, one row each: entry, behavior and viewport inspected, evidence path, principle, Tidefern adaptation, limits |
| `TYPOGRAPHY.md` | Stage 1 (task G3) | The rendered specimen comparison and the decision, with file sizes and license notes |
| `DESIGN.md` | Stage 2 (task G2) | The design contract: compositions compared, page map, desktop and phone sketches, components and states, interaction model, motion and sound vocabulary |
| `CONTENT.md` | Stage 2 | Route inventory: visitor question, content, action and destination, navigation, indexability, metadata, missing owner facts |
| `ASSETS.md` | Stage 2 | Every font, vector, icon, image and data table with source, license, dimensions and whether final or temporary |
| `QA.md` | Stage 6 | Findings as `location | severity | evidence | correction | verification`, plus the recorded tool conditions for performance runs |
| `qa/` | Stages 2 and 6 | Screenshot captures from `apps/web/scripts/capture.mjs` (both themes, desktop and phone) |

Brand facts and tokens live in `packages/design-tokens`; the decisions
behind them are in `docs/ARCHITECTURE.md` section 13. The public, agent
readable version of all of this is the `/design` reference in the app.
