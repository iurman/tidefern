# Vendored data sources

Every dataset under `packages/core/data` is listed here with its origin, the
date it was captured, its licence terms and the attribution the product must
show. The growth chart tables come first; the milestone checklists follow.
The infant context ranges close the file: they are a few published figures
encoded in `src/infant-context.ts`, so no file is vendored for them, and the
sentences they rely on are quoted here.

## Growth chart data

The files under `cdc/` and `who/` are the reference tables the growth engine
in `packages/core/src/growth.ts` runs on. They are kept exactly as downloaded
(Windows line endings and, in the WHO files, a byte order mark included) so a
future download can be compared byte for byte. `scripts/growth-data.mjs`
converts them into `packages/core/src/growth-data.json`, the only file the
engine imports; `pnpm growth:generate` rebuilds it and `pnpm growth:check`
fails when the committed JSON no longer matches the CSV files. Every file was
downloaded on 2026-10-05 with the URL, size and SHA-256 recorded below.

## Attribution

Source: CDC. Reference to CDC materials does not imply endorsement by CDC,
ATSDR, HHS or the United States Government of Tidefern, its company, products
or services.

WHO Child Growth Standards, World Health Organization, 2006, are the author
of the birth to 24 month standard; the files under `who/` are the National
Center for Health Statistics copies of those standards as published on
https://www.cdc.gov/growthcharts/who-data-files.htm. Used with acknowledgment
of WHO as the source; WHO does not endorse Tidefern.

Why the wording. CDC's reuse terms (https://www.cdc.gov/other/agencymaterials.html,
fetched 2026-10-05, page last reviewed May 1, 2023) require two things of
anyone reusing CDC material:

> 1) Attribution to the agency that developed the material must be provided
> in your use of the materials. Such attribution should clearly state the
> materials were developed by CDC ATSDR and/or HHS (e.g., "Source: CDC";
> "Materials developed by CDC");

> 2) You must utilize a disclaimer which clearly indicates that your use of
> the material, including any links to the materials on the CDC, ATSDR or HHS
> websites, does not imply endorsement by CDC, ATSDR, HHS or the United States
> Government of you, your company, product, facility, service or enterprise.

WHO's terms of use (https://www.who.int/about/policies/terms-of-use, fetched
2026-10-05) say:

> Any use of information in the web site should be accompanied by an
> acknowledgment of WHO as the source, citing the uniform resource locator
> (URL) of the article.

> Reproduction or translation of substantial portions of the web site, or any
> use other than for educational or other non-commercial purposes, require
> explicit, prior authorization in writing.

WHO's copyright page (https://www.who.int/about/policies/publishing/copyright,
fetched 2026-10-05) licenses WHO publications under CC BY-NC-SA 3.0 IGO and
adds: "WHO publications cannot be used to promote or endorse products,
services or any specific organization."

## Open permission question

The WHO tables are factual parameter tables (L, M and S by age) obtained from
CDC's hosting rather than from WHO's own site, and Tidefern has no paid tier.
Whether embedding them in a product with a paid tier needs WHO's written
authorization is an open question for the owner, recorded in
`docs/ARCHITECTURE.md` section 21: file a permissions request with WHO before
any paid tier, or switch to a build step that ingests WHO files without
redistributing them. CDC material needs attribution only (17 U.S.C. 105 and
the terms above).

## Which reference applies at which age

Grummer-Strawn LM, Reinold C, Krebs NF. Use of World Health Organization and
CDC Growth Charts for Children Aged 0--59 Months in the United States. MMWR
Recomm Rep 2010;59(RR-9):1-15, September 10, 2010.
https://www.cdc.gov/mmwr/preview/mmwrhtml/rr5909a1.htm (fetched 2026-10-05).

> CDC recommends that clinicians in the United States use the 2006 WHO
> international growth charts, rather than the CDC growth charts, for
> children aged <24 months

> When using the WHO growth charts to screen for possible abnormal or
> unhealthy growth, use of the 2.3rd and 97.7th percentiles (or ±2 standard
> deviations) are recommended, rather than the 5th and 95th percentiles.

> Likewise, the WHO percentiles (2.3rd and 97.7th, or ±2 standard
> deviations) also are arbitrary and not based on health outcomes.

The engine therefore selects the WHO tables under 730 days of age and the
CDC tables from 730 days, labels the band edges at the 2.3rd, 50th and
97.7th percentiles, and flags a measurement beyond plus or minus 2 SD for the
UI to pair with the pointing-to-care sentence rather than an alarm.

## Formulas

From https://www.cdc.gov/growthcharts/cdc-data-files.htm (fetched
2026-10-05, page last reviewed September 2, 2024):

> These files contain the L, M, and S parameters needed to generate exact
> percentiles and z-scores along with the percentile values for the 3rd,
> 5th, 10th, 25th, 50th, 75th, 90th, 95th, and 97th percentiles by sex
> (1=male; 2=female) and single month of age.

> Z = ((X/M)\*\*L) - 1) / (LS), L≠0 or Z = ln(X/M)/S, L=0

> X = M (1 + LSZ)\*\*(1/L), L ≠ 0 or X = M exp(SZ), L = 0

> Age is listed at the half month point for the entire month; for example,
> 1.5 months represents 1.0-1.99 months or 1.0 month up to but not including
> 2.0 months of age. The only exception is birth, which represents the point
> at birth.

> These data remain unchanged from the initial release on May 30, 2000 of the
> growth charts.

The page's worked example is the engine's primary test vector: a 9-month-old
male, WTAGEINF row 9.5, L=-0.1600954, M=9.476500305, S=0.11218624; z=-1.645
gives the 5th percentile, 7.90 kg; 9.7 kg gives z=0.207, the 58th percentile.

WHO's tail adjustment for weight-based indicators, from the WHO computation
note (https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/computation.pdf,
fetched 2026-10-05):

> Following the same methodology applied to the WHO Child Growth Standards,
> a restricted application of the LMS method was thus used for the 2007 WHO
> weight-based indicators, limiting the Box-Cox normal distribution to the
> interval corresponding to z-scores where empirical data were available
> (i.e. between -3 SD and 3 SD). Beyond these limits, the standard deviation
> at each age was fixed to the distance between ±2 SD and ±3 SD,
> respectively.

The engine applies this to weight-for-age, weight-for-length and BMI-for-age
on the WHO reference; length, stature and head circumference use the plain
formula, as does every CDC indicator.

## Conventions the JSON keeps

- Age in months is days divided by 30.4375 (365.25 / 12), the month both
  CDC's and WHO's own programs use.
- CDC rows keep the half-month axis exactly as the files list it (0, 0.5,
  1.5, ...), with birth as the exact point; the 2 to 20 year tables run from
  24 to 240 months. L, M and S are interpolated linearly between the two
  nearest rows.
- The WHO files hosted by CDC are monthly (0 to 24) and, for
  weight-for-length, in half centimetres (45 to 110 cm). WHO's own expanded
  daily tables were not vendored, so the engine interpolates between the
  monthly rows. For weight-for-length that costs under 0.1 percentile point;
  for the age-based indicators it misplaces the first weeks by up to 9.4
  points, measured below, so the engine marks a WHO assessment under 56 days
  as approximate.
- The percentile columns of every file are dropped from the JSON because the
  engine derives any percentile from L, M and S; they remain in the CSV files
  as a check (the tests confirm the hosted 2.3rd and 97.7th columns equal the
  engine's -2 SD and +2 SD values).
- No BMI table exists for the WHO reference in CDC's hosting, and BMI is not
  reported under age 2; CDC's `bmiagerev` applies from 24 months.

## Monthly rows in the first weeks

A newborn loses weight in the first days and regains it by the second week,
and length and head circumference grow fastest in the first month. One row
per month cannot carry that shape: a straight line from the birth row to
the one month row runs above WHO's weight curve for three weeks (at day 9
the interpolated median for boys is 3.679 kg where WHO's daily table says
3.558 kg) and below the length and head curves. To measure the cost, WHO's
expanded daily z-score tables were fetched on 2026-10-05 from the standard
pages on https://www.who.int/tools/child-growth-standards/standards/ and
every daily row from birth to day 730 was placed through the engine's
interpolation of the monthly rows at -2 SD, the median and +2 SD. The
largest gap, in percentile points, by age:

| Indicator, sex          | Birth to day 55 | Day 56 on | Day 183 on | Day 366 on |
| ----------------------- | --------------- | --------- | ---------- | ---------- |
| Weight-for-age, boys    | 9.3 (day 9)     | 1.6       | 0.3        | under 0.1  |
| Weight-for-age, girls   | 9.4 (day 7)     | 1.2       | 0.3        | under 0.1  |
| Length-for-age, boys    | 4.9 (day 14)    | 1.4       | 0.3        | 0.1        |
| Length-for-age, girls   | 5.8 (day 14)    | 1.3       | 0.3        | 0.1        |
| Head circumference, boys  | 4.2 (day 15)  | 1.4       | 0.5        | 0.1        |
| Head circumference, girls | 4.5 (day 15)  | 1.3       | 0.4        | 0.1        |

In z-score terms the largest gap is 0.27 (girls' weight, day 7) and from
day 56 it stays under 0.045 for every age-based indicator. Weight-for-length
compared against WHO's 0.1 cm expanded tables over 45 to 110 cm is within
0.002 z and 0.08 percentile points everywhere, so the half-centimetre rows
need no mark. The engine therefore sets `approximate` on a WHO assessment of
weight-for-age, length-for-age or head circumference-for-age under
`WHO_APPROXIMATE_UNDER_DAYS` (56 days, the age of the two month visit), and
the UI shows such a percentile as approximate or shows the band alone. The
CDC reference is never marked: its half-month rows are the ones CDC's own
program interpolates.

The daily tables were used for this measurement only and are not vendored,
because `docs/ARCHITECTURE.md` section 8.4 chose CDC's hosting of the WHO
files over WHO's spreadsheet tables and the WHO permission question above
is still open. Vendoring them later (the same attribution and permission
note would apply) removes the mark; the test on day 9 in
`packages/core/src/growth.test.ts` fails on purpose once the daily median
lands on the 50th percentile, as a reminder to delete the flag with it. The
files measured, each fetched with HTTP 200 and the `sfvrsn` token the WHO
page carried on that day:

| Table                              | URL                                                                                                                                                                                                       | Bytes  | SHA-256                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| Weight-for-age, boys, by day       | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/expanded-tables/wfa-boys-zscore-expanded-tables.xlsx?sfvrsn=65cce121_10                      | 198984 | b5b4748c6bfa5230e2eddafa1767629c349178b08d457f400b59422b8bfef86c |
| Weight-for-age, girls, by day      | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/expanded-tables/wfa-girls-zscore-expanded-tables.xlsx?sfvrsn=f01bc813_10                     | 197671 | ee3ae12cb96c6c5541cdf43665c03ce6c984f877859a183a5f6104eb06a49a6e |
| Length-for-age, boys, by day       | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/expandable-tables/lhfa-boys-zscore-expanded-tables.xlsx?sfvrsn=7b4a3428_12            | 200151 | c4b1c9029ab9751a5f0888e32f35c7c0287a16d361885cf911ecf23b3f7f6b4f |
| Length-for-age, girls, by day      | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/expandable-tables/lhfa-girls-zscore-expanded-tables.xlsx?sfvrsn=27f1e2cb_10           | 199890 | 6aa2876319449a6b1f4d825848128902114ff53c67b92b86a0c5140846013059 |
| Head circumference, boys, by day   | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/head-circumference-for-age/expanded-tables/hcfa-boys-zscore-expanded-tables.xlsx?sfvrsn=2ab1bec8_8          | 185962 | 89a657bc466e85f6c8f2e5e7f4635e969bdcf982bb71e519273e43896a1c3314 |
| Head circumference, girls, by day  | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/head-circumference-for-age/expanded-tables/hcfa-girls-zscore-expanded-tables.xlsx?sfvrsn=3a34b8b0_8         | 186723 | 8eec3770d1027ce1b3b96a7b89fd1e77070558a7791b17b4462cda8a813324a3 |
| Weight-for-length, boys, 0.1 cm    | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/expanded-tables/wfl-boys-zscore-expanded-table.xlsx?sfvrsn=d307434f_8              | 74264  | 1a6e9a002d2692d038161bc6572a10f8b9fa0657163808141d2981a2132c59cc |
| Weight-for-length, girls, 0.1 cm   | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/expanded-tables/wfl-girls-zscore-expanded-table.xlsx?sfvrsn=db7b5d6b_8             | 73863  | ec116b8e618ad311d34a87231346badf16c75f5c4f82222ec846e05c582bf16a |

Each workbook is one sheet with the columns Day (or Length), L, M, S and
the SD4neg to SD4 curves; the day 0 rows carry the same L, M and S as the
month 0 rows in CDC's files.

## Files

WHO Child Growth Standards, birth to 24 months, as hosted by CDC/NCHS on
https://www.cdc.gov/growthcharts/who-data-files.htm (page last reviewed
September 2, 2024). The page describes them as "LMS parameters and selected
smoothed ... percentiles" by age in months (weight in kilograms, length and
head circumference in centimetres) and, for weight-for-length, by recumbent
length in centimetres.

| File                                                    | URL                                                                                                                 | Bytes | SHA-256                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------- |
| `who/WHO-Boys-Weight-for-age-Percentiles.csv`           | https://ftp.cdc.gov/pub/Health_Statistics/NCHS/growthcharts/WHO-Boys-Weight-for-age-Percentiles.csv                 | 2682  | 6fcb43be71ced3fb068d992a86f2a50ef7bb4c2b615b4554e67b6371578d0d7f |
| `who/WHO-Girls-Weight-for-age-Percentiles.csv`          | https://ftp.cdc.gov/pub/Health_Statistics/NCHS/growthcharts/WHO-Girls-Weight-for-age%20Percentiles.csv              | 2738  | 00a152538466f649d58d66665e8f1fc0ab25bc3157c4706197eb772925ef7cae |
| `who/WHO-Boys-Length-for-age-Percentiles.csv`           | https://ftp.cdc.gov/pub/Health_Statistics/NCHS/growthcharts/WHO-Boys-Length-for-age-Percentiles.csv                 | 2576  | 42df3d55815c8f55bd64bffdda466913a24caeed6a9b3c7c651569a45b20d6f9 |
| `who/WHO-Girls-Length-for-age-Percentiles.csv`          | https://ftp.cdc.gov/pub/Health_Statistics/NCHS/growthcharts/WHO-Girls-Length-for-age-Percentiles.csv                | 2671  | 1b06300e72c137078e6fbed4a52238c04e2a3c445665e7f739ae62f34c294911 |
| `who/WHO-Boys-Weight-for-length-Percentiles.csv`        | https://ftp.cdc.gov/pub/Health_Statistics/NCHS/growthcharts/WHO-Boys-Weight-for-length-Percentiles.csv              | 14087 | e040da71179fc9fe7e9c65945ded38ef3b9cd78842b291495de9cfdd7c9ae313 |
| `who/WHO-Girls-Weight-for-length-Percentiles.csv`       | https://ftp.cdc.gov/pub/Health_Statistics/NCHS/growthcharts/WHO-Girls-Weight-for-length-Percentiles.csv             | 14091 | 62bda284c392a0371234db737ddd52e32f9b76a4df7864c8b1fdbe5018f583af |
| `who/WHO-Boys-Head-Circumference-for-age-Percentiles.csv`  | https://ftp.cdc.gov/pub/Health_Statistics/NCHS/growthcharts/WHO-Boys-Head-Circumference-for-age-Percentiles.csv  | 2638  | 5af6d648fb119568016fcdc7c53a61687a9cd9093ba100fe44bc0ddf7f5bf8fb |
| `who/WHO-Girls-Head-Circumference-for-age-Percentiles.csv` | https://ftp.cdc.gov/pub/Health_Statistics/NCHS/growthcharts/WHO-Girls-Head-Circumference-for-age-Percentiles.csv | 2638  | 8e95121c0bf437cda44bf6de168a2672c8a387d8343f4001c0dc5afb71b0bcc3 |

The girls' weight-for-age file is saved with a hyphen where CDC's URL has an
encoded space, so the eight files share one naming pattern.

CDC 2000 growth charts, LMS data files, from
https://www.cdc.gov/growthcharts/cdc-data-files.htm (page last reviewed
September 2, 2024; data unchanged since May 30, 2000). Each file holds both
sexes, 1 male and 2 female. `lenageinf.csv` and `bmiagerev.csv` repeat their
header line where the girls' rows begin; the generator skips the repeat.

| File                 | Chart                                                     | URL                                                   | Bytes | SHA-256                                                          |
| -------------------- | --------------------------------------------------------- | ----------------------------------------------------- | ----- | ---------------------------------------------------------------- |
| `cdc/wtageinf.csv`   | Weight-for-age, birth to 36 months, kg                    | https://www.cdc.gov/growthcharts/data/zscore/wtageinf.csv  | 11446 | 73221dd4de82eb9a70c1e6dd45c9b9e285fa1a3d7fff4971c3b85c1be6e5feed |
| `cdc/lenageinf.csv`  | Length-for-age, birth to 36 months, cm                    | https://www.cdc.gov/growthcharts/data/zscore/lenageinf.csv | 11232 | a334b86bc0ecde80d12cdc172dde17b4390ca53ac372b26dd0d72d8502ac2687 |
| `cdc/hcageinf.csv`   | Head circumference-for-age, birth to 36 months, cm        | https://www.cdc.gov/growthcharts/data/zscore/hcageinf.csv  | 11486 | bf7e2d7af8fdb336f0b159e480414842136da960ea6a730b7e73d1060b4549e9 |
| `cdc/wtleninf.csv`   | Weight-for-length, 45 to 103.5 cm, kg                     | https://www.cdc.gov/growthcharts/data/zscore/wtleninf.csv  | 18242 | 3dd616c8d11ad8ad5470929477609e6fc44cb2e5f7b95494061e1413a0034249 |
| `cdc/wtage.csv`      | Weight-for-age, 2 to 20 years, kg                         | https://www.cdc.gov/growthcharts/data/zscore/wtage.csv     | 66456 | 3406c9d125bcb69c062a9e84eb8c0209bfe9346542bdc1d308643750dcc241b7 |
| `cdc/statage.csv`    | Stature-for-age, 2 to 20 years, cm                        | https://www.cdc.gov/growthcharts/data/zscore/statage.csv   | 66087 | 45130d2a9d7c50c54a47e7ba626b66c61d4554bc2d901198cedd9419a53f7251 |
| `cdc/wtstat.csv`     | Weight-for-stature, 77 to 121.5 cm, kg                    | https://www.cdc.gov/growthcharts/data/zscore/wtstat.csv    | 15145 | 0f75b6ef7ac725c311bd3ff9d50c5b3b415b7faa00c99126b04f4f9a1c773db3 |
| `cdc/bmiagerev.csv`  | BMI-for-age, 2 to 20 years, kg/m2                         | https://www.cdc.gov/growthcharts/data/zscore/bmiagerev.csv | 72022 | cbeea0e8d500ee15c652f3fdc45bcd02cb9c15d4d1e86f4d8048bbfea8d166e5 |

cdc.gov answers 403 to a plain `curl`; the files were fetched with a browser
User-Agent and Accept headers, and the WHO girls' head circumference download
was retried once after a connection reset.

## CDC milestone checklists (`milestones/2022.json`)

Origin: CDC "Learn the Signs. Act Early." developmental milestone checklists,
2022 revision, text only, from the twelve per-age pages linked at
https://www.cdc.gov/act-early/milestones/index.html (the full URL list and the
capture method are in `milestones/README.md`).

Captured: 2026-10-05, rendered in Chromium; the pages reported "last reviewed
on May 15, 2026" (a later text-only fetch the same day showed "Reviewed: May
16, 2026" with identical items).

Licence: a United States Government work (17 U.S.C. 105), public domain, under
CDC's reuse terms: attribution to CDC, a disclaimer that use does not imply
endorsement by CDC, and no use of the CDC logo. Photos and videos on the CDC
pages may be contractor owned and were not captured.

Attribution shown with the data: "Source: CDC. Reference to CDC materials does
not imply endorsement by CDC, HHS or the U.S. Government." Shown next to it at
all times: "This is not a screening tool; your pediatrician is."

## Infant context ranges (`src/infant-context.ts`)

Architecture 8.4: "Feeding, diaper and sleep counts are shown against the
published AAP and AASM ranges as context, never as alarms, and no sleep
target is shown before four months." The ranges are encoded as data in
`packages/core/src/infant-context.ts`, each with the ids of the sources
below, and `infantContext(kind, dateOfBirth, today)` returns the range for a
child's age with its band and source ids, never a judgment. This section
quotes the sentence each range relies on, copied from the source and checked
against it on 2026-10-06. `src/infant-context.test.ts` reads this section:
it fails when a quote is missing, or when a range's figures, its "at least"
or its "including naps" stop matching the quote. The proposed family screen
lines wait for the owner in `docs/design/CONTENT.md`, and the claim is
registered in `docs/CLAIMS.md`.

### Attribution and terms

Feeding and wet diaper figures: American Academy of Pediatrics,
HealthyChildren.org. Sleep figures: American Academy of Sleep Medicine,
Paruthi S, et al., J Clin Sleep Med 2016;12(6):785-786. Tidefern is not
affiliated with either organization, neither has reviewed Tidefern, and
naming them implies no endorsement. The product names the publisher beside a
range and links to the page; it never shows their logos and never
reproduces their pages.

Both publishers keep their text under copyright, and neither grants the open
reuse CDC does. AAP's terms of use (https://www.aap.org/en/pages/terms-of-use/,
last updated 09/24/2026, read 2026-10-06) say:

> You will not copy, or distribute the Websites or other content without
> written permission from the AAP;

> Use or enable any of the Content from the Websites in conjunction with any
> artificial intelligence tool without the express written permission of the
> AAP.

and allow links:

> The AAP grants you a limited, revocable, and nonexclusive right to create a
> hyperlink to the webpages of the Websites, so long as the links do not
> portray AAP or its products or services in a false or misleading manner.

AASM's website terms (https://go.aasm.org/terms.html, effective 2/6/2026,
read 2026-10-06) say:

> AASM content and related intellectual property ("AASM IP") may not be
> entered into or used in any form in connection with generative artificial
> intelligence ("AI") tools.

Both sets of terms also forbid automated access, and the pages below were
read for this task by an AI agent with automated tools (curl, a headless
browser and a fetch tool). The figures are facts and each quote here is one
sentence kept so the figure can be checked, but whether Tidefern may keep
the quotes, should ask both publishers for written permission, or should
cite CDC instead is an open question for the owner's attorney in
`docs/CLAIMS.md`. Nothing in the build or the product fetches these pages.

### Sources

| Id                           | Publisher and title                                                                                                                                                                                                    | URL                                                                                                                                  | Date on the source       | Read       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ---------- |
| `aap-breastfed-enough-milk`  | American Academy of Pediatrics, Section on Breastfeeding; Joan Younger Meek, "How to Tell if Your Breastfed Baby is Getting Enough Milk", HealthyChildren.org                                                          | https://www.healthychildren.org/English/ages-stages/baby/breastfeeding/Pages/How-to-Tell-if-Baby-is-Getting-Enough-Milk.aspx         | Last updated 1/13/2025   | 2026-10-06 |
| `aap-how-often-and-how-much` | American Academy of Pediatrics; Sanjeev Jain and Maya Bunik, "How Often and How Much Should Your Baby Eat?", HealthyChildren.org                                                                                       | https://www.healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/How-Often-and-How-Much-Should-Your-Baby-Eat.aspx    | Last updated 4/2/2024    | 2026-10-06 |
| `aasm-2016-statement`        | American Academy of Sleep Medicine; Paruthi S, et al., "Recommended Amount of Sleep for Pediatric Populations: A Consensus Statement of the American Academy of Sleep Medicine", J Clin Sleep Med 2016;12(6):785-786 | https://aasm.org/resources/pdf/pediatricsleepdurationconsensus.pdf (DOI 10.5664/jcsm.5866; also https://pmc.ncbi.nlm.nih.gov/articles/PMC4877308/) | Published 15 June 2016   | 2026-10-06 |
| `aasm-2016-methodology`      | American Academy of Sleep Medicine; Paruthi S, et al., "Consensus Statement of the American Academy of Sleep Medicine on the Recommended Amount of Sleep for Healthy Children: Methodology and Discussion", J Clin Sleep Med 2016;12(11):1549-1561 | https://www.aasm.org/resources/pdf/pediatricsleepdurationmethods.pdf (DOI 10.5664/jcsm.6288)                                         | Published 15 November 2016 | 2026-10-06 |

The DOIs resolve to the journal's current publisher, Springer, whose pages
show the citation and the dates above but put the full text behind a
subscription. AASM's own copies of the two papers are the free full text:
`pediatricsleepdurationconsensus.pdf` is 226556 bytes with SHA-256
`2ed4737a4e30bfa42edc1a7b0867f456aec734e5e6146819abf9b98152013585`, and
`pediatricsleepdurationmethods.pdf` is 2242364 bytes with SHA-256
`779eb5c764cf3178de545e39f2e03e849a978a6f8474eade86689b0901a3fcfe`. PMC's
copy of the statement carries the same sentences, and AASM's position page
"Child Sleep Duration Health Advisory" (updated by the AASM Board of
Directors April 3, 2016) repeats the figures through 12 years. The
statement says it was endorsed by the American Academy of Pediatrics.

### Ranges

| Range id                      | Kind      | Age band (label)                    | From             | Until            | Figure per 24 hours            | Sources                                              |
| ----------------------------- | --------- | ----------------------------------- | ---------------- | ---------------- | ------------------------------ | ---------------------------------------------------- |
| `feed-newborn`                | feed      | Newborns                            | birth            | 1 month          | at least 8 to 12 feeds         | `aap-breastfed-enough-milk`, `aap-how-often-and-how-much` |
| `wet-diaper-first-days`       | wetDiaper | In the first few days after birth   | birth            | day 5            | 2 to 3 wet diapers             | `aap-how-often-and-how-much`                         |
| `wet-diaper-after-first-days` | wetDiaper | After the first 4 to 5 days         | day 5            | 1 month          | at least 5 to 6 wet diapers    | `aap-how-often-and-how-much`                         |
| `sleep-4-to-12-months`        | sleep     | 4 to 12 months                      | 4 months         | 12 months        | 12 to 16 hours, naps included  | `aasm-2016-statement`, `aasm-2016-methodology`       |
| `sleep-1-to-2-years`          | sleep     | 1 to 2 years                        | 1 year           | 3 years          | 11 to 14 hours, naps included  | `aasm-2016-statement`, `aasm-2016-methodology`       |
| `sleep-3-to-5-years`          | sleep     | 3 to 5 years                        | 3 years          | 6 years          | 10 to 13 hours, naps included  | `aasm-2016-statement`, `aasm-2016-methodology`       |
| `sleep-6-to-12-years`         | sleep     | 6 to 12 years                       | 6 years          | 13 years         | 9 to 12 hours                  | `aasm-2016-statement`, `aasm-2016-methodology`       |
| `sleep-13-to-18-years`        | sleep     | 13 to 18 years                      | 13 years         | 19 years         | 8 to 10 hours                  | `aasm-2016-statement`, `aasm-2016-methodology`       |

"From" is the first day of the band and "Until" the first day after it. Day
0 is the date of birth. Months and years are completed calendar months, the
rule of the age label (`formatChildAge` in apps/web): a band that starts at
4 months starts on the day the label first says "4 months", and a year band
starts on a birthday. Outside every band of its kind the function returns
nothing: no sleep range before 4 months, no feed or wet diaper range after
the first month.

### The sentences each range relies on

`aap-breastfed-enough-milk`, under "A well-nourished newborn should:", the
figure for `feed-newborn`:

> Nurse at least 8 to 12 times every 24 hours.

`aap-how-often-and-how-much`, the same newborn figure for bottle-fed and
breastfed babies, the end of the newborn band, and both wet diaper bands:

> If bottle-fed, most newborns eat every 2 to 3 hours; 8 times is generally
> recommended as the minimum every 24 hours.

> Breastfed newborns usually nurse every 2 hours from the start of the
> feeding to the next feeding so 10-12 sessions in 24 hours is the norm.

> By the end of the first month, most babies consume at least 3 or 4 ounces
> per feeding, about every 3 to 4 hours.

> A newborn's diaper is a good indicator of whether they are getting enough
> to eat.

> In the first few days after birth, a baby should have 2 to 3 wet diapers
> each day.

> After the first 4 to 5 days, a baby should have at least 5 to 6 wet
> diapers a day.

`aasm-2016-statement`, the five recommendations and the footnote on infants
(the asterisk is the statement's own):

> Infants\* 4 months to 12 months should sleep 12 to 16 hours per 24 hours
> (including naps) on a regular basis to promote optimal health.

> Children 1 to 2 years of age should sleep 11 to 14 hours per 24 hours
> (including naps) on a regular basis to promote optimal health.

> Children 3 to 5 years of age should sleep 10 to 13 hours per 24 hours
> (including naps) on a regular basis to promote optimal health.

> Children 6 to 12 years of age should sleep 9 to 12 hours per 24 hours on a
> regular basis to promote optimal health.

> Teenagers 13 to 18 years of age should sleep 8 to 10 hours per 24 hours on
> a regular basis to promote optimal health.

> \*Recommendations for infants younger than 4 months are not included due to
> the wide range of normal variation in duration and patterns of sleep, and
> insufficient evidence for associations with health outcomes.

`aasm-2016-methodology`, section 2.3, which defines the age groups behind
the statement's labels (the source writes the last group, 13 to 18 years,
with a range dash, so the quote stops before it):

> After a preliminary review of the literature, prior Centers for Disease
> Control and Prevention (CDC), AASM, and National Sleep Foundation (NSF)
> recommendations, as well as commonly frequented websites, the following
> age groups were created: < 12 months, 12 months to < 3 years, 3 years to
> < 6 years, 6 years to < 13 years, and

and, after the voting rounds:

> Thus, no recommendations were made for children under 4 months of age for
> any of the categories.

### How the edges were chosen

- Sleep. The statement's labels overlap at 12 months ("4 months to 12
  months", then "1 to 2 years"); the methodology's groups do not, so the
  bands follow them: a child moves to the next band on the birthday that
  starts it, and "13 to 18 years" runs to the 19th birthday. The figures
  before 6 years count naps; the statement says nothing of naps after that.
- Newborn feeds. The breastfeeding page says to nurse at least 8 to 12
  times every 24 hours; the "How Often" page says bottle-fed newborns eat
  every 2 to 3 hours with at least 8 feeds, and breastfed newborns 10 to 12
  times. Each of those falls within "at least 8 to 12", so one range covers
  either way of feeding. The band ends at 1 month because the "How Often"
  page and AAP's formula page change the pattern "by the end of the first
  month". After that no AAP count applies to every baby: the formula page
  ("Amount and Schedule of Baby Formula Feedings",
  https://www.healthychildren.org/English/ages-stages/baby/formula-feeding/Pages/amount-and-schedule-of-formula-feedings.aspx,
  last updated 5/16/2022, read 2026-10-06) gives formula-fed babies
  feedings about every 3 to 4 hours at one month and 4 or 5 feedings in 24
  hours at 6 months, and says breastfed babies take smaller, more frequent
  feedings. A bottle may hold breast milk, so the product cannot tell which
  figure would apply, and no feed range is offered after the first month.
  Solids are not part of these figures.
- Wet diapers. "After the first 4 to 5 days" leaves day 4 on either side;
  the higher figure starts at day 5, the later edge, so it never shows
  early. The page presents diapers as a newborn sign, so the second band
  ends with the newborn band at 1 month. A diaper logged as mixed is wet.

### Read and left out

- `aap-breastfed-enough-milk` also lists "6 or more wet diapers per day ...
  by 5 to 7 days old", close to but not the same as the "How Often" page's
  "at least 5 to 6" after 4 to 5 days; the encoded bands follow the "How
  Often" page because it gives both the first days and the days after.
- The "How Often" page gives stools too ("at least 4 stools a day" by the
  fourth day) but says stool frequency varies more and depends on whether
  the baby is breastfed or formula-fed, and the breastfeeding page gives
  other day by day figures, so no dirty diaper range is encoded: the diaper
  ranges count wet diapers only.
- CDC's public domain pages, read 2026-10-06 in a browser, state the newborn
  feed count ("Your baby will breastfeed about 8 to 12 times in 24 hours.",
  https://www.cdc.gov/infant-toddler-nutrition/breastfeeding/how-much-and-how-often.html)
  and the AASM sleep figures from 4 months to 12 years
  (https://www.cdc.gov/sleep/about/index.html, which says 8 to 10 hours for
  13 to 17 years and adds a 0 to 3 month row from another source that
  Tidefern must not use, since no sleep target is shown before 4 months),
  but give a different day by day table of minimum
  wet diapers (https://www.cdc.gov/infant-toddler-nutrition/breastfeeding/newborn-basics.html:
  1 on day 1, 2 on day 2, 5 on day 3, 6 on day 4, 6 on days 5 to 7). They
  are the fallback if the attorney advises against the AAP and AASM quotes,
  with the diaper bands redone from CDC's table.
