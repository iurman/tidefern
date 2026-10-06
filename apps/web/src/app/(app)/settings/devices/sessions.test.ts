import { describe, expect, it } from "vitest";
import { calendarDayOf, describeUserAgent, toDevices } from "./sessions";

const firefoxLinux = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";
const chromeWindows =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
const safariIphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const edgeMac =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0";
const chromeIos =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/154.0.0.0 Mobile/15E148 Safari/604.1";
const headless =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36";

describe("describeUserAgent", () => {
  it("names the browser and the platform in the design's words", () => {
    expect(describeUserAgent(firefoxLinux)).toBe("Firefox on Linux");
    expect(describeUserAgent(chromeWindows)).toBe("Chrome on Windows");
    expect(describeUserAgent(safariIphone)).toBe("Safari on iPhone");
  });

  it("reads Edge and Chrome on iOS before the Chrome and Safari tokens they also carry", () => {
    expect(describeUserAgent(edgeMac)).toBe("Edge on Mac");
    expect(describeUserAgent(chromeIos)).toBe("Chrome on iPhone");
  });

  it("treats a headless Chromium as Chrome, which is what the browser suite runs", () => {
    expect(describeUserAgent(headless)).toBe("Chrome on Linux");
  });

  it("never shows a raw agent string for something it cannot name", () => {
    expect(describeUserAgent("curl/8.6.0")).toBe("A browser");
    expect(describeUserAgent("Something/1.0 (Windows NT 10.0)")).toBe("A browser on Windows");
    expect(describeUserAgent(null)).toBe("A browser");
    expect(describeUserAgent(undefined)).toBe("A browser");
    expect(describeUserAgent("")).toBe("A browser");
  });
});

describe("calendarDayOf", () => {
  it("reads the instant in the given zone, so the day can differ from UTC", () => {
    expect(calendarDayOf("2026-10-05T23:30:00Z", "UTC")).toBe("2026-10-05");
    expect(calendarDayOf("2026-10-05T23:30:00Z", "Europe/London")).toBe("2026-10-06");
    expect(calendarDayOf(new Date("2026-10-05T03:30:00Z"), "America/Los_Angeles")).toBe(
      "2026-10-04",
    );
  });

  it("falls back to today for an instant it cannot read", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(calendarDayOf("not a date", "UTC", now)).toBe("2026-10-05");
  });
});

describe("toDevices", () => {
  const sessions = [
    {
      id: "older",
      token: "t-older",
      createdAt: "2026-09-20T08:00:00Z",
      updatedAt: "2026-10-01T08:00:00Z",
      userAgent: chromeWindows,
    },
    {
      id: "current",
      token: "t-current",
      createdAt: "2026-09-30T08:00:00Z",
      updatedAt: "2026-10-03T08:00:00Z",
      userAgent: firefoxLinux,
    },
    {
      id: "newest",
      token: "t-newest",
      createdAt: "2026-10-04T08:00:00Z",
      updatedAt: "2026-10-05T08:00:00Z",
      userAgent: safariIphone,
    },
  ];

  it("puts the current session first and the rest by last request, newest first", () => {
    const devices = toDevices(sessions, "current", "UTC");
    expect(devices.map((device) => device.id)).toEqual(["current", "newest", "older"]);
    expect(devices[0]).toMatchObject({
      browser: "Firefox on Linux",
      lastSeen: "2026-10-03",
      current: true,
      token: "t-current",
    });
    expect(devices.filter((device) => device.current)).toHaveLength(1);
  });

  it("marks no row current when the current session is unknown", () => {
    const devices = toDevices(sessions, null, "UTC");
    expect(devices.map((device) => device.id)).toEqual(["newest", "current", "older"]);
    expect(devices.every((device) => !device.current)).toBe(true);
  });

  it("uses the creation instant when the session carries no readable update", () => {
    const devices = toDevices(
      [
        { id: "a", token: "ta", createdAt: "2026-10-01T00:00:00Z", updatedAt: "bad" },
        { id: "b", token: "tb", createdAt: "2026-10-02T00:00:00Z", updatedAt: "bad" },
      ],
      null,
      "UTC",
      new Date("2026-10-05T00:00:00Z"),
    );
    expect(devices.map((device) => device.id)).toEqual(["b", "a"]);
  });

  it("does not change the list it was given", () => {
    const copy = [...sessions];
    toDevices(sessions, "current", "UTC");
    expect(sessions).toEqual(copy);
  });
});
