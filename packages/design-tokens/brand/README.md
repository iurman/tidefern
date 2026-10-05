# Tidefern brand vectors

These SVGs are a hand-authored reconstruction of the mark on the brand sheet
at `assets/brand/reference/tidefern-brand-sheet.webp`: a fern frond unrolling
from a sea glass wave with a mist highlight. They are the canonical source for
every client. `apps/web/public/brand/` holds verified copies (`pnpm --filter
web brand:check`).

The vectors are a color-separated trace of the owner's reference image
(`assets/brand/reference/tidefern-mark-reference.png`): `trace/trace.py`
upsamples the image six times, separates the sea glass wave, the mist
highlight and the green frond by hue, smooths each mask and traces it with
potrace into cubic paths; `trace/smooth.py` resamples each outline, runs a Gaussian along it (wide for the wave, gentle for the frond so leaflet necks stay crisp) and refits smooth cubics; `trace/build.py` assembles the five variants from
those three paths (Python 3 with numpy, pillow and potracer; run the three in that order from
this folder, copy the SVGs up one level, then `pnpm --filter web brand:sync`). Nothing is drawn by hand,
so the mark is the reference, not an interpretation of it. The colors of the
light variant are the medians sampled from the image.

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
