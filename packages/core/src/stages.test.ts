import { describe, expect, it } from "vitest";
import {
  QUIET_CARD_ACTION,
  bodyQuestionsFor,
  changeDueDate,
  cyclePredictionAfter,
  endPregnancy,
  projectPregnancy,
  stageAfter,
  type Pregnancy,
} from "./stages";

const active: Pregnancy = {
  id: "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
  subjectId: "11111111-1111-7111-8111-111111111111",
  dueDate: "2026-10-17",
  datingMethod: "lmp",
  startedAt: "2026-02-01T09:00:00Z",
  endedAt: null,
  endedReason: null,
  dueDateChanges: [],
};

const birth = endPregnancy(active, { endedAt: "2026-10-12", reason: "birth" });
const loss = endPregnancy(active, { endedAt: "2026-04-03", reason: "loss" });
const other = endPregnancy(active, { endedAt: "2026-04-03", reason: "other" });

describe("ending a pregnancy", () => {
  it("records the ending date and reason once and refuses a second ending", () => {
    expect(birth.pregnancy).toMatchObject({ endedAt: "2026-10-12", endedReason: "birth" });
    expect(active.endedAt).toBeNull();
    expect(() => endPregnancy(birth.pregnancy, { endedAt: "2026-10-13", reason: "other" })).toThrow(
      /already ended/,
    );
    expect(() => endPregnancy(active, { endedAt: "2026-13-01", reason: "loss" })).toThrow(
      RangeError,
    );
  });
  it("refuses an ending dated before the pregnancy began", () => {
    // Due 2026-10-17, so day 0 of gestation is 2026-01-10.
    expect(() => endPregnancy(active, { endedAt: "2026-01-09", reason: "loss" })).toThrow(
      /before the pregnancy began/,
    );
    expect(endPregnancy(active, { endedAt: "2026-01-10", reason: "loss" }).pregnancy.endedAt).toBe(
      "2026-01-10",
    );
  });
  it("keeps the reason in her own responses and never in a partner's", () => {
    const hers = projectPregnancy(birth.pregnancy, "owner");
    expect(hers.endedReason).toBe("birth");
    expect(hers.status).toBe("ended");
    for (const ended of [birth, loss, other]) {
      const theirs = projectPregnancy(ended.pregnancy, "partner");
      expect(Object.keys(theirs)).not.toContain("endedReason");
      expect(JSON.stringify(theirs)).not.toContain(ended.pregnancy.endedReason);
    }
    const whileActive = projectPregnancy(active, "partner");
    expect(Object.keys(whileActive)).not.toContain("endedReason");
    expect(Object.keys(whileActive)).not.toContain("dueDateChanges");
  });
  it("freezes a partner's view to the paused state with no dates once it has ended", () => {
    expect(projectPregnancy(active, "partner")).toEqual({
      status: "active",
      id: active.id,
      dueDate: "2026-10-17",
    });
    expect(projectPregnancy(birth.pregnancy, "partner")).toStrictEqual({ status: "paused" });
    expect(projectPregnancy(loss.pregnancy, "partner")).toStrictEqual({ status: "paused" });
  });
  it("cancels queued reminders and clears predictions in the same effects, notifying nobody", () => {
    for (const ended of [birth, loss, other]) {
      expect(ended.effects).toMatchObject({
        clearPredictions: true,
        cancelReminders: true,
        notifyPartners: false,
      });
    }
  });
  it("moves the stage to postpartum after a birth and to cycle otherwise", () => {
    expect(stageAfter(active)).toBe("pregnancy");
    expect(birth.effects.stage).toBe("postpartum");
    expect(stageAfter(birth.pregnancy)).toBe("postpartum");
    expect(loss.effects.stage).toBe("cycle");
    expect(stageAfter(loss.pregnancy)).toBe("cycle");
    expect(other.effects.stage).toBe("cycle");
    expect(stageAfter(other.pregnancy)).toBe("cycle");
  });
  it("offers no prediction until a period start dated after the ending is logged, then widens the window", () => {
    const before = [{ date: "2026-01-02" }, { date: "2026-01-30" }];
    expect(cyclePredictionAfter(before, active)).toBeNull();
    expect(cyclePredictionAfter(before, loss.pregnancy)).toBeNull();
    const onTheDay = [...before, { date: "2026-04-03" }];
    expect(cyclePredictionAfter(onTheDay, loss.pregnancy)).toBeNull();
    const afterwards = cyclePredictionAfter([...before, { date: "2026-05-20" }], loss.pregnancy);
    expect(afterwards?.basis).toBe("first_guess");
    expect(afterwards?.nextPeriodStart).toBe("2026-06-17");
    expect(afterwards?.uncertaintyDays).toBe(5);
    const postpartum = cyclePredictionAfter([...before, { date: "2027-01-05" }], birth.pregnancy);
    expect(postpartum?.sampleSize).toBe(0);
    expect(postpartum?.uncertaintyDays).toBe(5);
  });
  it("names the one action on the quiet card", () => {
    expect(QUIET_CARD_ACTION).toBe("log a period when it comes");
  });
});

describe("due date changes", () => {
  it("appends every change to the history with the previous value kept for her", () => {
    const redated = changeDueDate(active, {
      next: "2026-10-20",
      method: "ultrasound",
      changedAt: "2026-03-07T10:00:00Z",
    });
    expect(redated.dueDate).toBe("2026-10-20");
    expect(redated.datingMethod).toBe("ultrasound");
    expect(redated.dueDateChanges).toEqual([
      {
        previous: "2026-10-17",
        next: "2026-10-20",
        method: "ultrasound",
        changedAt: "2026-03-07T10:00:00Z",
      },
    ]);
    const again = changeDueDate(redated, {
      next: "2026-10-18",
      method: "manual",
      changedAt: "2026-05-01T08:00:00Z",
    });
    expect(again.dueDateChanges).toHaveLength(2);
    expect(again.dueDateChanges[1]?.previous).toBe("2026-10-20");
    expect(active.dueDateChanges).toEqual([]);
    expect(projectPregnancy(again, "owner").dueDateChanges).toHaveLength(2);
    expect(Object.keys(projectPregnancy(again, "partner"))).not.toContain("dueDateChanges");
  });
  it("records nothing when the date and method are unchanged", () => {
    const same = changeDueDate(active, {
      next: active.dueDate,
      method: active.datingMethod,
      changedAt: "2026-03-07T10:00:00Z",
    });
    expect(same).toBe(active);
    expect(() =>
      changeDueDate(active, {
        next: "2026-02-30",
        method: "manual",
        changedAt: "2026-03-07T10:00:00Z",
      }),
    ).toThrow(RangeError);
  });
  it("refuses an empty or malformed changedAt instant", () => {
    for (const changedAt of ["", "yesterday", "2026-03-07T25:00:00Z"]) {
      expect(() =>
        changeDueDate(active, { next: "2026-10-20", method: "manual", changedAt }),
      ).toThrow(RangeError);
    }
  });
  it("refuses a due date change once the pregnancy has ended", () => {
    for (const ended of [birth, loss, other]) {
      expect(() =>
        changeDueDate(ended.pregnancy, {
          next: "2026-10-20",
          method: "manual",
          changedAt: "2026-11-01T08:00:00Z",
        }),
      ).toThrow(/already ended/);
      expect(ended.pregnancy.dueDateChanges).toEqual([]);
    }
  });
});

describe("body questions", () => {
  it("asks nobody with the none stage a question about her body", () => {
    expect(bodyQuestionsFor("none")).toEqual([]);
  });
  it("asks each tracking stage for the date it needs", () => {
    expect(bodyQuestionsFor("cycle").map((question) => question.id)).toEqual(["last_period_start"]);
    expect(bodyQuestionsFor("pregnancy").map((question) => question.id)).toEqual([
      "due_date",
      "dating_method",
    ]);
    expect(bodyQuestionsFor("postpartum").map((question) => question.id)).toEqual([
      "birth_date",
      "last_period_start",
    ]);
    expect(bodyQuestionsFor("postpartum").find((q) => q.id === "last_period_start")?.optional).toBe(
      true,
    );
  });
});
