# Tidefern brand vectors

These SVGs are a hand-authored reconstruction of the mark on the brand sheet
at `assets/brand/reference/tidefern-brand-sheet.webp`: a fern frond unrolling
from a sea glass wave with a mist highlight. They are the canonical source for
every client. `apps/web/public/brand/` holds verified copies (`pnpm --filter
web brand:check`).

The vectors are built from the owner's reference image
(`assets/brand/reference/tidefern-mark-reference.png`) in three steps, all in
`trace/` (Python 3 with numpy, pillow, scipy, scikit-image and potracer; run
them in this order from that folder, then copy the five SVGs up one level
and run `pnpm --filter web brand:sync`):

1. `trace.py` upsamples the image eight times, separates the sea glass wave,
   the mist highlight and the green frond by hue, and traces each mask with
   potrace. `smooth.py` resamples the wave and highlight outlines, runs a
   Gaussian along them and refits smooth cubics.
2. `geometry.py` rebuilds the frond as geometry fitted to the trace: the
   stem is a tapered stroke along its measured centerline (a geodesic over
   the skeleton from the wave to the inner tip of the crozier, with the
   width read from the distance transform and the inner edge clamped to the
   bend radius so the outline never folds), and every leaflet is the same
   teardrop, sized and oriented from the blob it replaces and placed one
   uniform gap from the stem. Leaflets are all detached, by design.
3. `build.py` assembles the five variants. The wave is drawn over the stem
   so the frond roots behind the crest, as in the reference.

Status: traced from the owner's reference on 2026-10-04 and pending the owner's approval. If
the owner supplies original vector files, replace these files in place, keep
the names, and re-run the brand sync. Never recreate the mark with a font,
an image generator or a trace of a raster.

| File                     | Use                                                        |
| ------------------------ | ---------------------------------------------------------- |
| `tidefern-mark.svg`      | Full color mark on light surfaces (Mist, Sand, white)      |
| `tidefern-mark-dark.svg` | Mark for dark surfaces (page, surface, panel in dark mode) |
| `tidefern-icon.svg`      | App icon: the mark inside a Mist rounded square            |

Wordmark: the word Tidefern set in Newsreader at weight 500 beside the mark,
never traced into paths. Tagline under the wordmark: Figtree, uppercase,
letter spacing 0.18em, Sea Glass accent color.
