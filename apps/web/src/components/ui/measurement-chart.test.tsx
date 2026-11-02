import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { GrowthAssessment } from "@tidefern/core";
import { MeasurementChart, displayFromSi, displayUnit, percentileWords } from "./measurement-chart";

const today = "2026-10-05";
const birthDate = "2026-02-10";

const weights = [
  { date: "2026-02-10", value: 3200 },
  { date: "2026-03-12", value: 4100 },
  { date: "2026-04-14", value: 5000 },
  { date: "2026-06-16", value: 6300 },
  { date: "2026-08-18", value: 7200 },
  { date: "2026-09-29", value: 7700 },
];

const lowWeights = [
  { date: "2026-02-10", value: 3100 },
  { date: "2026-06-16", value: 5300 },
  { date: "2026-09-29", value: 5400 },
];

describe("display conversion", () => {
  it("converts stored SI integers with the core factors", () => {
    expect(displayFromSi("weightForAge", "metric", 7700)).toBe(7.7);
    expect(displayFromSi("weightForAge", "us", 4535.9237)).toBeCloseTo(10, 6);
    expect(displayFromSi("lengthForAge", "metric", 685)).toBe(68.5);
    expect(displayFromSi("lengthForAge", "us", 254)).toBeCloseTo(10, 6);
    expect(displayUnit("weightForAge", "metric")).toBe("kg");
    expect(displayUnit("weightForAge", "us")).toBe("lb");
    expect(displayUnit("headCircumferenceForAge", "metric")).toBe("cm");
    expect(displayUnit("headCircumferenceForAge", "us")).toBe("in");
  });
});

describe("percentileWords", () => {
  const assessment = (percentile: number, approximate = false) =>
    ({ percentile, approximate }) as GrowthAssessment;

  it("says at, about, below or above instead of a 0th or 100th rank", () => {
    expect(percentileWords(assessment(45.4))).toBe("at the 45th percentile");
    expect(percentileWords(assessment(47, true))).toBe("about the 47th percentile");
    expect(percentileWords(assessment(0.3))).toBe("below the 1st percentile");
    expect(percentileWords(assessment(99.6))).toBe("above the 99th percentile");
    expect(percentileWords(assessment(2.3))).toBe("at the 2nd percentile");
    expect(percentileWords(assessment(11))).toBe("at the 11th percentile");
  });
});

describe("MeasurementChart", () => {
  it("names itself by the latest reading and lists every value in words", () => {
    render(
      <MeasurementChart
        sex="female"
        indicator="weightForAge"
        birthDate={birthDate}
        today={today}
        measurements={weights}
      />,
    );
    const name = screen.getByRole("img").getAttribute("aria-labelledby") as string;
    expect(document.getElementById(name)).toHaveTextContent(
      /^Weight for age, since birth: 6 measurements, the latest 7\.7 kg on Sep 29, at the \d+(st|nd|rd|th) percentile\.$/,
    );
    expect(document.querySelectorAll(".dot")).toHaveLength(6);
    expect(document.querySelectorAll(".band")).toHaveLength(1);
    expect(document.querySelectorAll(".median")).toHaveLength(1);
    expect(document.querySelectorAll(".line")).toHaveLength(2);
    const readings = screen.getByRole("list", { name: "Readings" });
    expect(readings.querySelectorAll("li")).toHaveLength(6);
    expect(readings).toHaveTextContent("Feb 10: 3.2 kg, about the");
    expect(
      screen.getByText(/WHO Child Growth Standards, 0 to 24 months; CDC after\./),
    ).toHaveTextContent("Approximate in the first eight weeks.");
    expect(screen.queryByText(/worth mentioning/)).toBeNull();
  });

  it("swaps the range in place through the radio group", async () => {
    const user = userEvent.setup();
    render(
      <MeasurementChart
        sex="female"
        indicator="weightForAge"
        birthDate={birthDate}
        today={today}
        measurements={weights}
      />,
    );
    expect(screen.getByRole("radio", { name: "Since birth" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Last 3 months" }));
    expect(screen.getByRole("radio", { name: "Last 3 months" })).toBeChecked();
    expect(document.querySelector("title")).toHaveTextContent(
      /^Weight for age, last 3 months: 2 measurements/,
    );
    expect(document.querySelectorAll(".dot")).toHaveLength(2);
  });

  it("adds the pointing-to-care sentence for the owner only, never for a partner", () => {
    const { rerender } = render(
      <MeasurementChart
        sex="female"
        indicator="weightForAge"
        birthDate={birthDate}
        today={today}
        measurements={lowWeights}
      />,
    );
    expect(
      screen.getByText("This is worth mentioning to your doctor or midwife."),
    ).toBeInTheDocument();
    rerender(
      <MeasurementChart
        sex="female"
        indicator="weightForAge"
        birthDate={birthDate}
        today={today}
        measurements={lowWeights}
        viewer="partner"
        units="us"
      />,
    );
    expect(screen.queryByText(/worth mentioning/)).toBeNull();
    expect(screen.getByRole("list", { name: "Readings" })).toHaveTextContent("11.9 lb");
  });

  it("leaves the sentence to the page when careSentence is false", () => {
    render(
      <MeasurementChart
        sex="female"
        indicator="weightForAge"
        birthDate={birthDate}
        today={today}
        measurements={lowWeights.map((weight) => ({ ...weight, pointToCare: true }))}
        careSentence={false}
      />,
    );
    expect(screen.queryByText(/worth mentioning/)).toBeNull();
    expect(screen.getByRole("list", { name: "Readings" })).toBeInTheDocument();
  });

  it("follows the API's pointToCare when the answer carries it, and never computes it then", () => {
    const flagged = lowWeights.map((weight, index) => ({
      ...weight,
      id: `m-${index}`,
      pointToCare: index === 2,
    }));
    const first = render(
      <MeasurementChart
        sex="female"
        indicator="weightForAge"
        birthDate={birthDate}
        today={today}
        measurements={flagged.map((weight, index) => ({ ...weight, pointToCare: index === 0 }))}
        initialRange="lastThreeMonths"
      />,
    );
    // A flagged reading outside the chosen range is not on the chart, so neither is the sentence.
    expect(screen.queryByText(/worth mentioning/)).toBeNull();
    first.unmount();
    const { rerender } = render(
      <MeasurementChart
        sex="female"
        indicator="weightForAge"
        birthDate={birthDate}
        today={today}
        measurements={flagged}
      />,
    );
    expect(
      screen.getByText("This is worth mentioning to your doctor or midwife."),
    ).toBeInTheDocument();
    // Core would place these readings beyond 2 SD, but the answer says no: the answer wins.
    rerender(
      <MeasurementChart
        sex="female"
        indicator="weightForAge"
        birthDate={birthDate}
        today={today}
        measurements={flagged.map((weight) => ({ ...weight, pointToCare: false }))}
      />,
    );
    expect(screen.queryByText(/worth mentioning/)).toBeNull();
    // And a partner's view never carries it, whatever the flags say.
    rerender(
      <MeasurementChart
        sex="female"
        indicator="weightForAge"
        birthDate={birthDate}
        today={today}
        measurements={flagged}
        viewer="partner"
      />,
    );
    expect(screen.queryByText(/worth mentioning/)).toBeNull();
  });

  it("takes the profile's imperial units and lists two readings of one day under their own keys", () => {
    render(
      <MeasurementChart
        sex="female"
        indicator="lengthForAge"
        birthDate={birthDate}
        today={today}
        units="imperial"
        measurements={[
          { id: "first", date: "2026-09-29", value: 685 },
          { id: "second", date: "2026-09-29", value: 690 },
        ]}
      />,
    );
    const readings = screen.getByRole("list", { name: "Readings" });
    expect(readings.querySelectorAll("li")).toHaveLength(2);
    expect(readings).toHaveTextContent("Sep 29: 27.0 in");
    expect(readings).toHaveTextContent("Sep 29: 27.2 in");
  });

  it("leaves the empty state's action out for a viewer who cannot add a measurement", () => {
    render(
      <MeasurementChart
        sex="female"
        indicator="weightForAge"
        birthDate={birthDate}
        today={today}
        measurements={[]}
        addHref={null}
      />,
    );
    expect(screen.getByText("No measurements yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add a measurement" })).toBeNull();
  });

  it("follows the empty state formula and the loading and error voice", () => {
    const { rerender } = render(
      <MeasurementChart
        sex="female"
        indicator="weightForAge"
        birthDate={birthDate}
        today={today}
        measurements={[]}
        addHref="/add"
      />,
    );
    expect(screen.getByText("No measurements yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a measurement" })).toHaveAttribute("href", "/add");
    rerender(
      <MeasurementChart
        sex="female"
        indicator="weightForAge"
        birthDate={birthDate}
        today={today}
        measurements={weights}
        loading
      />,
    );
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.getByText("Loading measurements")).toBeInTheDocument();
    rerender(
      <MeasurementChart
        sex="female"
        indicator="weightForAge"
        birthDate={birthDate}
        today={today}
        measurements={weights}
        error="Try again."
      />,
    );
    expect(screen.getByText("Try again.")).toBeInTheDocument();
  });
});
