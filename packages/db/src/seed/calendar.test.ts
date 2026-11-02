import { describe, expect, test } from "vitest";
import { dateIn, noonIn, shiftDays } from "./calendar";

/** The wall-clock hour an instant reads as in a zone. */
function hourIn(at: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit" }).format(at),
  );
}

describe("noonIn", () => {
  test("places noon by the zone's offset on that date", () => {
    // Berlin in summer time, on its 25-hour day (back to winter time at 01:00 UTC), and on its
    // 23-hour day; Vancouver behind UTC; Auckland so far ahead that its noon is the previous UTC day.
    expect(noonIn("2026-10-04", "Europe/Berlin").toISOString()).toBe("2026-10-04T10:00:00.000Z");
    expect(noonIn("2026-10-25", "Europe/Berlin").toISOString()).toBe("2026-10-25T11:00:00.000Z");
    expect(noonIn("2027-03-28", "Europe/Berlin").toISOString()).toBe("2027-03-28T10:00:00.000Z");
    expect(noonIn("2026-10-04", "America/Vancouver").toISOString()).toBe(
      "2026-10-04T19:00:00.000Z",
    );
    expect(noonIn("2026-10-04", "Pacific/Auckland").toISOString()).toBe("2026-10-03T23:00:00.000Z");
  });

  test("reads back as the same date at noon in every cast zone, every day of a year", () => {
    for (const zone of ["Europe/Berlin", "America/Vancouver", "America/New_York"]) {
      for (let day = 0; day < 366; day += 1) {
        const date = shiftDays("2026-06-01", day);
        const noon = noonIn(date, zone);
        expect(dateIn(noon, zone), `${date} in ${zone}`).toBe(date);
        expect(hourIn(noon, zone), `${date} in ${zone}`).toBe(12);
      }
    }
  });
});
