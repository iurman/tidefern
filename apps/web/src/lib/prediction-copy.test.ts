import type { CyclePrediction } from "@tidefern/schemas";
import { describe, expect, it } from "vitest";
import {
  CARE_SENTENCE,
  CONTRACEPTION_LINE,
  PREDICTION_FOOTER,
  careSentence,
  deviationSentence,
  estimateSentence,
  fertileSentence,
  predictionCopy,
} from "./prediction-copy";

/** The API's answer for five regular cycles: the shape GET /v1/cycle/predictions returns. */
const estimate: CyclePrediction = {
  subjectId: "018f5e7a-5eed-7000-8000-000000000001",
  computedAt: "2026-10-05T08:00:00.000Z",
  basis: "estimate",
  cycleLength: 28,
  sampleSize: 5,
  nextPeriod: { expected: "2026-10-08", start: "2026-10-07", end: "2026-10-09" },
  ovulation: { expected: "2026-09-24", start: "2026-09-22", end: "2026-09-26" },
  fertileWindow: { start: "2026-09-19", end: "2026-09-24" },
  uncertaintyDays: 1,
  ovulationBandDays: 2,
  irregular: false,
  periodsLogged: 6,
  cycleLengthRange: { min: 27, max: 29 },
  daysLate: 0,
  pointToCare: false,
};

const firstGuess: CyclePrediction = {
  ...estimate,
  basis: "first_guess",
  sampleSize: 0,
  nextPeriod: { expected: "2026-10-08", start: "2026-10-04", end: "2026-10-12" },
  uncertaintyDays: 4,
  periodsLogged: 1,
  cycleLengthRange: null,
};

const notEnough: CyclePrediction = {
  ...estimate,
  basis: "not_enough_regular_cycles",
  cycleLength: null,
  sampleSize: 0,
  nextPeriod: null,
  ovulation: null,
  fertileWindow: null,
  uncertaintyDays: 4,
  cycleLengthRange: null,
  daysLate: null,
};

const none: CyclePrediction = {
  subjectId: estimate.subjectId,
  computedAt: estimate.computedAt,
  basis: "none",
  cycleLength: null,
  sampleSize: 0,
  nextPeriod: null,
  ovulation: null,
  fertileWindow: null,
  uncertaintyDays: 0,
  ovulationBandDays: 2,
};

describe("the 13.10 templates from the API's prediction", () => {
  it("writes the estimate with the number of cycles and the range", () => {
    expect(estimateSentence(estimate)).toBe(
      "Based on your last 5 cycles, your next period will likely start between Oct 7 and Oct 9.",
    );
    expect(estimateSentence({ ...estimate, sampleSize: 1 })).toBe(
      "Based on your last cycle, your next period will likely start between Oct 7 and Oct 9.",
    );
  });

  it("names both months when the range crosses one", () => {
    const crossing = {
      ...estimate,
      nextPeriod: { expected: "2026-10-31", start: "2026-10-28", end: "2026-11-03" },
    };
    expect(estimateSentence(crossing)).toBe(
      "Based on your last 5 cycles, your next period will likely start between Oct 28 and Nov 3.",
    );
  });

  it("writes the first guess around the expected day, give or take the uncertainty", () => {
    expect(estimateSentence(firstGuess)).toBe(
      "Log 3 periods and Tidefern can start estimating. For now this is a rough guess: around Oct 8, give or take 4 days.",
    );
  });

  it("says the cycles were too different when no date is offered for that reason", () => {
    expect(estimateSentence(notEnough)).toBe(
      "Your recent cycles have been too different from each other to estimate a date. Keep logging and this will update.",
    );
    expect(fertileSentence(notEnough)).toBeNull();
  });

  it("writes ovulation as the API's band and the fertile days with the contraception line", () => {
    expect(fertileSentence(estimate)).toBe(
      "Ovulation is estimated around Sep 24 (Sep 22 to 26). Sep 19 to 24 are the days pregnancy is most likely. An estimate from your logged dates. Not a form of contraception.",
    );
    expect(fertileSentence(firstGuess)?.endsWith(CONTRACEPTION_LINE)).toBe(true);
    const crossing = {
      ...estimate,
      ovulation: { expected: "2026-10-01", start: "2026-09-29", end: "2026-10-03" },
      fertileWindow: { start: "2026-09-26", end: "2026-10-01" },
    };
    expect(fertileSentence(crossing)).toBe(
      "Ovulation is estimated around Oct 1 (Sep 29 to Oct 3). Sep 26 to Oct 1 are the days pregnancy is most likely. An estimate from your logged dates. Not a form of contraception.",
    );
  });

  it("writes the deviation nudge only when the API flags irregular cycles", () => {
    expect(deviationSentence(estimate)).toBeNull();
    expect(
      deviationSentence({
        ...estimate,
        sampleSize: 6,
        irregular: true,
        cycleLengthRange: { min: 24, max: 39 },
      }),
    ).toBe(
      "Your last 6 cycles ranged from 24 to 39 days. Variation like this is common, and it is worth mentioning to your doctor or midwife.",
    );
  });

  it("points to care only when the API says so", () => {
    expect(careSentence(estimate)).toBeNull();
    expect(careSentence({ ...estimate, pointToCare: true, daysLate: 15 })).toBe(
      "This is worth mentioning to your doctor or midwife.",
    );
    expect(CARE_SENTENCE).toBe("This is worth mentioning to your doctor or midwife.");
  });

  it("keeps the footer word for word", () => {
    expect(PREDICTION_FOOTER).toBe(
      "Tidefern gives estimates from what you log. It does not provide medical advice, diagnosis or treatment, and is not a form of birth control. Talk with your doctor or midwife before making health decisions.",
    );
  });
});

describe("predictionCopy", () => {
  it("handles basis none first: no sentence at all, the footer still there", () => {
    expect(predictionCopy(none)).toEqual({
      estimate: null,
      fertile: null,
      deviation: null,
      care: null,
      offered: false,
      footer: PREDICTION_FOOTER,
    });
  });

  it("gives a grantee's answer, which carries no owner fields, no nudge and no care line", () => {
    const shared: CyclePrediction = {
      subjectId: estimate.subjectId,
      computedAt: estimate.computedAt,
      basis: estimate.basis,
      cycleLength: estimate.cycleLength,
      sampleSize: estimate.sampleSize,
      nextPeriod: estimate.nextPeriod,
      ovulation: estimate.ovulation,
      fertileWindow: estimate.fertileWindow,
      uncertaintyDays: estimate.uncertaintyDays,
      ovulationBandDays: estimate.ovulationBandDays,
    };
    const copy = predictionCopy(shared);
    expect(copy.deviation).toBeNull();
    expect(copy.care).toBeNull();
    expect(copy.estimate).toContain("Based on your last 5 cycles");
  });

  it("refuses to invent a date the API did not send", () => {
    expect(estimateSentence({ ...estimate, nextPeriod: null })).toBeNull();
    expect(fertileSentence({ ...estimate, fertileWindow: null })).toBeNull();
  });
});
