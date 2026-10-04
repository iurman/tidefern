# Fonts

Self-hosted variable fonts, Latin subset, copied from the fontsource packages
`@fontsource-variable/newsreader` and `@fontsource-variable/figtree` (5.3.0).
Both are licensed under the SIL Open Font License 1.1 with no Reserved Font
Name; the license texts sit beside the files, as the OFL requires for
distributed copies, and the credits page lists both copyright holders.

| File                                 | Axes                          | Use                                      |
| ------------------------------------ | ----------------------------- | ---------------------------------------- |
| `newsreader-latin-opsz-normal.woff2` | wght 200 to 800, opsz 6 to 72 | Display, headings, the wordmark geometry |
| `newsreader-latin-wght-italic.woff2` | wght 200 to 800               | The single intro italic (`type-intro`)   |
| `figtree-latin-wght-normal.woff2`    | wght 300 to 900               | Body, controls, labels, numerals         |
| `figtree-latin-wght-italic.woff2`    | wght 300 to 900               | Emphasis in body copy                    |

The roman Newsreader file is the optical-size build (132 KB) so that
`font-optical-sizing: auto` serves the sturdier low-size cut at 16 px and the
higher-contrast cut at display sizes without any CSS. The italic stays on the
smaller weight-only build because it appears at one size. Counters, dates and
tables use `font-variant-numeric: tabular-nums` (both families expose `tnum`).
