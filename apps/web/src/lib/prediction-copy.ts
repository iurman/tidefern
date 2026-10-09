import type { CyclePrediction } from "@tidefern/schemas";
import { formatDay, formatDaySpan, pluralDays } from "@/components/ui/marks-format";

/**
 * The prediction copy of architecture 13.10, word for word, from the API's
 * answer (GET /v1/cycle/predictions): the numbers and dates are the API's,
 * the words are these. One module, so every surface (the ring, Today, the
 * calendar) says the same thing and a later locale is a translation here.
 *
 * Dates are calendar days the API already computed in the profile's time
 * zone, so they are printed as those days: read as UTC midnight and
 * formatted in en-US with the UTC zone (marks-format), which never lets the
 * machine's own zone move a day. Nothing here reads a clock.
 */

/** The tail every fertile-window element carries, and the short disclaimer under the estimate. */
export const CONTRACEPTION_LINE =
  "An estimate from your logged dates. Not a form of contraception.";

/** Every fertile-window day carries the contraception line in its own name (the calendar and its design specimen). */
export const FERTILE_WORDS = `fertile window estimated. ${CONTRACEPTION_LINE}`;
/** The words the estimated ovulation day adds to its name. */
export const OVULATION_WORDS = "ovulation estimated";

/** The footer on every prediction surface. */
export const PREDICTION_FOOTER =
  "Tidefern gives estimates from what you log. It does not provide medical advice, diagnosis or treatment, and is not a form of birth control. Talk with your doctor or midwife before making health decisions.";

/** Pointing to care: only ever on her own view, which is the only view the API flags it on. */
export const CARE_SENTENCE = "This is worth mentioning to your doctor or midwife.";

export const NOT_ENOUGH_REGULAR_CYCLES =
  "Your recent cycles have been too different from each other to estimate a date. Keep logging and this will update.";

/** "your last 5 cycles"; one completed cycle reads "your last cycle". */
function lastCycles(count: number): string {
  return count === 1 ? "your last cycle" : `your last ${count} cycles`;
}

/**
 * The estimate sentence by the prediction's basis. Basis `none` is handled
 * first: no date is offered (nothing logged, or a pregnancy in progress or
 * just ended), so there is no sentence. A basis that should carry a date but
 * arrives without one also gets none rather than a sentence that is not true.
 */
export function estimateSentence(prediction: CyclePrediction): string | null {
  const { basis, nextPeriod, sampleSize, uncertaintyDays } = prediction;
  if (basis === "none") return null;
  if (basis === "not_enough_regular_cycles") return NOT_ENOUGH_REGULAR_CYCLES;
  if (nextPeriod === null) return null;
  if (basis === "first_guess") {
    return `Log 3 periods and Tidefern can start estimating. For now this is a rough guess: around ${formatDay(nextPeriod.expected)}, give or take ${pluralDays(uncertaintyDays)}.`;
  }
  return `Based on ${lastCycles(sampleSize)}, your next period will likely start between ${formatDay(nextPeriod.start)} and ${formatDay(nextPeriod.end)}.`;
}

/**
 * The ovulation and fertile days sentence, ending with the contraception
 * line, or null when the API offers no window (basis none or not enough
 * regular cycles). Ovulation is always the band the API sent, never a day.
 */
export function fertileSentence(prediction: CyclePrediction): string | null {
  const { basis, ovulation, fertileWindow } = prediction;
  if (basis !== "estimate" && basis !== "first_guess") return null;
  if (ovulation === null || fertileWindow === null) return null;
  const band = formatDaySpan(ovulation.start, ovulation.end);
  const days = formatDaySpan(fertileWindow.start, fertileWindow.end);
  return `Ovulation is estimated around ${formatDay(ovulation.expected)} (${band}). ${days} are the days pregnancy is most likely. ${CONTRACEPTION_LINE}`;
}

/**
 * The deviation nudge, when the API flags her recent cycles as irregular
 * and sends their spread. Both fields are owner only, so a grantee's answer
 * never produces it. The count is the cycles the spread was drawn from,
 * which is the sample the estimate rests on.
 */
export function deviationSentence(prediction: CyclePrediction): string | null {
  const { irregular, cycleLengthRange, sampleSize } = prediction;
  if (irregular !== true || cycleLengthRange === null || cycleLengthRange === undefined) {
    return null;
  }
  return `Your last ${sampleSize} cycles ranged from ${cycleLengthRange.min} to ${cycleLengthRange.max} days. Variation like this is common, and it is worth mentioning to your doctor or midwife.`;
}

/** The pointing-to-care sentence when the API says so (owner only: a period more than two weeks late). */
export function careSentence(prediction: CyclePrediction): string | null {
  return prediction.pointToCare === true ? CARE_SENTENCE : null;
}

export interface PredictionCopy {
  /** The estimate, first guess or not-enough sentence; null for basis none. */
  estimate: string | null;
  /** Ovulation and the fertile days with the contraception line; null without a window. */
  fertile: string | null;
  /** The deviation nudge; null unless the API flags it. */
  deviation: string | null;
  /** Pointing to care; null unless the API flags it. */
  care: string | null;
  /** Whether the prediction offers anything to say: false for basis none. */
  offered: boolean;
  footer: string;
}

/** Every sentence a prediction surface may show, from one API answer. */
export function predictionCopy(prediction: CyclePrediction): PredictionCopy {
  return {
    estimate: estimateSentence(prediction),
    fertile: fertileSentence(prediction),
    deviation: deviationSentence(prediction),
    care: careSentence(prediction),
    offered: prediction.basis !== "none",
    footer: PREDICTION_FOOTER,
  };
}
