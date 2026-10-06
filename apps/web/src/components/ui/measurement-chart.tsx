"use client";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  DAYS_PER_MONTH,
  GRAMS_PER_KILOGRAM,
  GRAMS_PER_POUND,
  MILLIMETRES_PER_CENTIMETRE,
  chooseReference,
  diffDays,
  growthAssessment,
  inchesFromMillimetres,
  lmsFor,
  valueFromZ,
  type CalendarDate,
  type GrowthAssessment,
  type Sex,
} from "@tidefern/core";
import {
  areaPath,
  chartRanges,
  linePath,
  linearScale,
  niceTicks,
  padDomain,
  rangeStartAgeDays,
  sampleAges,
  type ChartRange,
} from "./chart-scale";
import { formatDay, ordinal } from "./marks-format";
import { frondCurlPath, type Point } from "./ring-geometry";
import styles from "./measurement-chart.module.css";

/**
 * The measurement chart with the percentile band (DESIGN.md 6.5): age on
 * the x axis, the SI measure converted for display on the y axis, the
 * 2.3rd to 97.7th band at 40 percent fill with a 1 px edge, the median
 * dashed, the child's measurements as text-colored dots joined by a 2 px
 * line that ends in the frond curl. The band edges, percentiles and the
 * "beyond 2 SD" flag all come from @tidefern/core. The chart is an image;
 * the readings beneath it carry every value in words, and the
 * pointing-to-care sentence appears only on the owner's view.
 */

export type ChartIndicator = "weightForAge" | "lengthForAge" | "headCircumferenceForAge";

export interface ChartMeasurement {
  date: CalendarDate;
  /** The stored SI integer: grams for weight, millimetres for length and head circumference. */
  value: number;
}

export interface MeasurementChartProps {
  sex: Sex;
  indicator: ChartIndicator;
  birthDate: CalendarDate;
  /** Today's calendar date in the profile's time zone; never read from the machine. */
  today: CalendarDate;
  measurements: ChartMeasurement[];
  /** The display choice; storage is always SI. */
  units?: "metric" | "us";
  /** A partner's view never carries the pointing-to-care sentence. */
  viewer?: "owner" | "partner";
  initialRange?: ChartRange;
  /** Where the empty state's one action leads. */
  addHref?: string;
  loading?: boolean;
  error?: string;
  className?: string;
}

/** The band edges core reports (2.3rd and 97.7th percentiles) sit at plus and minus two standard deviations. */
const BAND_Z = 2;
const DEFAULT_WIDTH = 600;
const MARGIN = { top: 16, right: 24, bottom: 36, left: 48 };
const BAND_SAMPLES = 48;

const indicatorLabels: Record<ChartIndicator, string> = {
  weightForAge: "Weight for age",
  lengthForAge: "Length for age",
  headCircumferenceForAge: "Head circumference for age",
};

function isWeight(indicator: ChartIndicator): boolean {
  return indicator === "weightForAge";
}

/** The unit the axis and the readings show. */
export function displayUnit(indicator: ChartIndicator, units: "metric" | "us"): string {
  if (isWeight(indicator)) return units === "metric" ? "kg" : "lb";
  return units === "metric" ? "cm" : "in";
}

/** A stored SI integer in the display unit, unrounded. */
export function displayFromSi(
  indicator: ChartIndicator,
  units: "metric" | "us",
  value: number,
): number {
  if (isWeight(indicator)) {
    return units === "metric" ? value / GRAMS_PER_KILOGRAM : value / GRAMS_PER_POUND;
  }
  return units === "metric" ? value / MILLIMETRES_PER_CENTIMETRE : inchesFromMillimetres(value);
}

/** A reference table value (kilograms or centimetres) in the display unit. */
function displayFromTable(indicator: ChartIndicator, units: "metric" | "us", value: number) {
  const si = isWeight(indicator) ? value * GRAMS_PER_KILOGRAM : value * MILLIMETRES_PER_CENTIMETRE;
  return displayFromSi(indicator, units, si);
}

function formatValue(value: number): string {
  return value.toFixed(1);
}

interface Reading {
  date: CalendarDate;
  ageDays: number;
  display: number;
  assessment: GrowthAssessment | null;
}

interface BandSample {
  ageDays: number;
  low: number;
  median: number;
  high: number;
}

function bandSamples(
  sex: Sex,
  indicator: ChartIndicator,
  units: "metric" | "us",
  start: number,
  end: number,
): BandSample[] {
  const samples: BandSample[] = [];
  for (const ageDays of sampleAges(start, end, BAND_SAMPLES)) {
    const lms = lmsFor({
      reference: chooseReference(ageDays),
      sex,
      indicator,
      ageMonths: ageDays / DAYS_PER_MONTH,
    });
    if (!lms) continue;
    const { l, m, s } = lms;
    samples.push({
      ageDays,
      low: displayFromTable(indicator, units, valueFromZ(-BAND_Z, l, m, s)),
      median: displayFromTable(indicator, units, m),
      high: displayFromTable(indicator, units, valueFromZ(BAND_Z, l, m, s)),
    });
  }
  return samples;
}

function useMeasuredWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (measured && measured > 0) setWidth(Math.round(measured));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function MeasurementChart(props: MeasurementChartProps) {
  const {
    sex,
    indicator,
    birthDate,
    today,
    measurements,
    units = "metric",
    viewer = "owner",
    initialRange = "sinceBirth",
    addHref = "/family",
    loading = false,
    error,
    className,
  } = props;
  const [range, setRange] = useState<ChartRange>(initialRange);
  const [plotRef, width] = useMeasuredWidth();
  const id = useId();
  const titleId = `${id}-title`;
  const rootClass = [styles.chart, className].filter(Boolean).join(" ");
  const unit = displayUnit(indicator, units);
  const label = indicatorLabels[indicator];

  if (loading) {
    return (
      <figure className={rootClass} aria-busy="true">
        <div className={styles.placeholder}>
          <p className={styles.text}>Loading measurements</p>
        </div>
      </figure>
    );
  }
  if (error) {
    return (
      <figure className={rootClass}>
        <div className={styles.placeholder}>
          <p className={styles.errorText}>{error}</p>
        </div>
      </figure>
    );
  }
  if (measurements.length === 0) {
    return (
      <figure className={rootClass}>
        <div className={styles.placeholder}>
          <p className={styles.emptyHeading}>No measurements yet</p>
          <p className={styles.text}>
            Add a weight or length and the chart draws the percentile band around it.
          </p>
          <a className={styles.action} href={addHref}>
            Add a measurement
          </a>
        </div>
      </figure>
    );
  }

  const todayAge = Math.max(0, diffDays(birthDate, today));
  const readings: Reading[] = measurements
    .map((measurement) => {
      const ageDays = diffDays(birthDate, measurement.date);
      return {
        date: measurement.date,
        ageDays,
        display: displayFromSi(indicator, units, measurement.value),
        assessment:
          ageDays >= 0
            ? growthAssessment({ sex, ageDays, indicator, value: measurement.value })
            : null,
      };
    })
    .filter((reading) => reading.ageDays >= 0)
    .sort((a, b) => a.ageDays - b.ageDays);
  const newestAge = readings.at(-1)?.ageDays ?? 0;
  const startAge = rangeStartAgeDays(range, todayAge);
  const endAge = Math.max(todayAge, newestAge, startAge + 30);
  const shown = readings.filter((reading) => reading.ageDays >= startAge);
  const band = bandSamples(sex, indicator, units, startAge, endAge);

  const height = Math.round(Math.min(300, Math.max(190, width * 0.55)));
  const x = linearScale([startAge, endAge], [MARGIN.left, width - MARGIN.right]);
  const yValues = [
    ...band.flatMap((sample) => [sample.low, sample.high]),
    ...shown.map((reading) => reading.display),
  ];
  const yDomain = padDomain([Math.min(...yValues), Math.max(...yValues)]);
  const y = linearScale(yDomain, [height - MARGIN.bottom, MARGIN.top]);
  const yTicks = niceTicks(yDomain, 4);
  const monthTicks = niceTicks([startAge / DAYS_PER_MONTH, endAge / DAYS_PER_MONTH], 5);

  const upper: Point[] = band.map((sample) => ({ x: x(sample.ageDays), y: y(sample.high) }));
  const lower: Point[] = band.map((sample) => ({ x: x(sample.ageDays), y: y(sample.low) }));
  const median: Point[] = band.map((sample) => ({ x: x(sample.ageDays), y: y(sample.median) }));
  const points: Point[] = shown.map((reading) => ({
    x: x(reading.ageDays),
    y: y(reading.display),
  }));
  let curl = "";
  const newest = points.at(-1);
  if (newest) {
    const previous = points.at(-2) ?? { x: newest.x - 1, y: newest.y };
    const length = Math.hypot(newest.x - previous.x, newest.y - previous.y) || 1;
    const tangent = { x: (newest.x - previous.x) / length, y: (newest.y - previous.y) / length };
    const up = tangent.y <= 0 ? { x: tangent.y, y: -tangent.x } : { x: -tangent.y, y: tangent.x };
    const inward = up.y <= 0 ? up : { x: -up.x, y: -up.y };
    curl = frondCurlPath(newest, tangent, inward, 16);
  }

  const latest = shown.at(-1);
  const rangeLabel = (
    chartRanges.find((option) => option.value === range)?.label ?? "Since birth"
  ).toLowerCase();
  const title = latest
    ? `${label}, ${rangeLabel}: ${shown.length} ${shown.length === 1 ? "measurement" : "measurements"}, the latest ${formatValue(latest.display)} ${unit} on ${formatDay(latest.date)}${percentileClause(latest.assessment)}.`
    : `${label}, ${rangeLabel}: no measurements in this range.`;
  const approximate = shown.some((reading) => reading.assessment?.approximate);
  const beyondBand =
    viewer === "owner" && shown.some((reading) => reading.assessment?.farOutsideBand);

  return (
    <figure className={rootClass}>
      <fieldset className={styles.ranges}>
        <legend className="sr-only">Range</legend>
        {chartRanges.map((option) => (
          <label key={option.value} className={styles.pill}>
            <input
              className={styles.radio}
              type="radio"
              name={`${id}-range`}
              value={option.value}
              checked={range === option.value}
              onChange={() => setRange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <div ref={plotRef} className={styles.plot}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby={titleId}
          focusable="false"
        >
          <title id={titleId}>{title}</title>
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                className={styles.grid}
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text className={styles.tick} x={MARGIN.left - 8} y={y(tick)} textAnchor="end">
                {tick}
              </text>
            </g>
          ))}
          {monthTicks.map((month) => (
            <text
              key={month}
              className={styles.tick}
              x={x(month * DAYS_PER_MONTH)}
              y={height - MARGIN.bottom + 18}
              textAnchor="middle"
            >
              {month}
            </text>
          ))}
          <text className={styles.axisLabel} x={MARGIN.left} y={MARGIN.top - 4}>
            {unit}
          </text>
          <text
            className={styles.axisLabel}
            x={width - MARGIN.right}
            y={height - 4}
            textAnchor="end"
          >
            Age in months
          </text>
          {band.length ? <path className={styles.band} d={areaPath(upper, lower)} /> : null}
          {band.length ? <path className={styles.median} d={linePath(median)} /> : null}
          {points.length ? <path className={styles.line} d={linePath(points)} /> : null}
          {curl ? <path className={styles.line} d={curl} /> : null}
          {points.map((point, index) => (
            <circle key={index} className={styles.dot} cx={point.x} cy={point.y} r={4} />
          ))}
        </svg>
      </div>
      <figcaption className={styles.caption}>
        <p className={styles.source}>
          WHO Child Growth Standards, 0 to 24 months; CDC after.
          {approximate ? " Approximate in the first eight weeks." : ""}
        </p>
        {beyondBand ? (
          <p className={styles.care}>This is worth mentioning to your doctor or midwife.</p>
        ) : null}
        <ol className={styles.readings} aria-label="Readings">
          {shown.map((reading) => (
            <li key={reading.date}>
              <time dateTime={reading.date}>{formatDay(reading.date)}</time>
              {": "}
              <span className="tabular">
                {formatValue(reading.display)} {unit}
              </span>
              {reading.assessment
                ? `, ${percentileWords(reading.assessment)}`
                : ", no reference for this age"}
            </li>
          ))}
          {shown.length === 0 ? <li>No measurements in this range.</li> : null}
        </ol>
      </figcaption>
    </figure>
  );
}

/**
 * "at the 45th percentile", "about the 47th percentile" while the WHO rows are
 * coarse, "below the 1st percentile" or "above the 99th percentile" past the
 * ends, where a rounded rank would read as 0th or 100th.
 */
export function percentileWords(assessment: GrowthAssessment): string {
  const { percentile, approximate } = assessment;
  if (percentile < 1) return "below the 1st percentile";
  if (percentile > 99) return "above the 99th percentile";
  return `${approximate ? "about" : "at"} the ${ordinal(percentile)} percentile`;
}

function percentileClause(assessment: GrowthAssessment | null): string {
  return assessment ? `, ${percentileWords(assessment)}` : "";
}
