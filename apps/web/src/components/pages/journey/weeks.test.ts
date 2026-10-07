import { describe, expect, it } from "vitest";
import { countedToday, pregnancyStart, weekByWeek, weekOf, weekSpan } from "./weeks";

// The seeded shape of Lena's pregnancy on the frozen calendar: due Feb 7,
// 2027 and today Oct 4, 2026 in Vancouver, which is 22w0d.
const due = "2027-02-07";
const today = "2026-10-04";

const events = [
  { id: "dating", date: "2026-08-09" },
  { id: "anatomy", date: "2026-09-20" },
  { id: "kicks", date: "2026-09-29" },
  { id: "glucose", date: "2026-11-01" },
];

describe("the weeks from the due date", () => {
  it("counts day 0 as the due date minus 280 days, and the due date opens week 40", () => {
    expect(pregnancyStart(due)).toBe("2026-05-03");
    expect(weekOf(due, today)).toBe(22);
    expect(weekSpan(due, 22)).toEqual({ start: "2026-10-04", end: "2026-10-10" });
    expect(weekOf(due, due)).toBe(40);
  });

  it("puts a day before day 0 in week 0 rather than a week that does not exist", () => {
    expect(weekOf(due, "2026-04-20")).toBe(0);
  });

  it("finds the day the API counted from the gestation it sent", () => {
    expect(countedToday(due, 154)).toBe(today);
  });
});

describe("weekByWeek", () => {
  it("leads the weeks ahead with this one and keeps only the weeks that hold something", () => {
    const { earlier, ahead } = weekByWeek(due, today, events);
    expect(earlier.map((group) => [group.week, group.items.map((item) => item.id)])).toEqual([
      [14, ["dating"]],
      [20, ["anatomy"]],
      [21, ["kicks"]],
    ]);
    expect(ahead).toEqual([
      { week: 22, start: "2026-10-04", end: "2026-10-10", items: [] },
      {
        week: 26,
        start: "2026-11-01",
        end: "2026-11-07",
        items: [{ id: "glucose", date: "2026-11-01" }],
      },
    ]);
  });

  it("is this week alone when nothing is added yet", () => {
    expect(weekByWeek(due, today, [])).toEqual({
      earlier: [],
      ahead: [{ week: 22, start: "2026-10-04", end: "2026-10-10", items: [] }],
    });
  });

  it("keeps a week past the due date like any other that holds something", () => {
    const later = [...events, { id: "check", date: "2027-02-28" }];
    expect(weekByWeek(due, today, later).ahead.at(-1)).toMatchObject({
      week: 43,
      items: [{ id: "check" }],
    });
  });

  it("starts at this week when the due date has passed", () => {
    const { earlier, ahead } = weekByWeek(due, "2027-02-16", events);
    expect(ahead.map((group) => group.week)).toEqual([41]);
    expect(earlier.map((group) => group.week)).toEqual([14, 20, 21, 26]);
  });

  it("keeps the order items came in within a week, this week's included", () => {
    const sameWeek = [
      { id: "first", date: "2026-10-05" },
      { id: "second", date: "2026-10-05" },
      { id: "third", date: "2026-10-09" },
    ];
    const { ahead } = weekByWeek(due, today, sameWeek);
    expect(ahead).toHaveLength(1);
    expect(ahead[0]?.items.map((item) => item.id)).toEqual(["first", "second", "third"]);
  });
});
