"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { formatDay } from "@/components/ui/marks-format";
import {
  MeasurementChart,
  displayFromSi,
  displayUnit,
  type ChartIndicator,
  type ChartMeasurement,
} from "@/components/ui/measurement-chart";
import { MeasurementInput } from "@/components/ui/measurement-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SegmentedDateInput } from "@/components/ui/segmented-date-input";
import { TextLink } from "@/components/ui/text-link";
import { browserApiClient } from "@/lib/api-browser";
import { failureLine, familyCopy } from "./copy";
import {
  addMeasurement,
  attemptFor,
  keepsAttempt,
  type Attempt,
  type NewMeasurement,
} from "./mutations";
import type { ChildMeasurement, UnitSystem } from "./types";
import styles from "./child.module.css";

const copy = familyCopy.growth;

const indicators: readonly ChartIndicator[] = [
  "weightForAge",
  "lengthForAge",
  "headCircumferenceForAge",
];
const indicatorOptions = indicators.map((value) => ({ value, label: copy.indicators[value] }));

/** The stored SI value a chart indicator reads from one measurement session. */
function valueOf(measurement: ChildMeasurement, indicator: ChartIndicator): number | null {
  switch (indicator) {
    case "weightForAge":
      return measurement.weightGrams;
    case "lengthForAge":
      return measurement.lengthMillimetres;
    case "headCircumferenceForAge":
      return measurement.headMillimetres;
  }
}

/**
 * One indicator's readings for the chart, keyed by measurement id, each
 * with the API's guardian-only `pointToCare` where the answer carries it:
 * the chart follows that flag and computes nothing (architecture 8.4).
 */
export function chartSeries(
  measurements: readonly ChildMeasurement[],
  indicator: ChartIndicator,
): ChartMeasurement[] {
  return measurements.flatMap((measurement) => {
    const value = valueOf(measurement, indicator);
    if (value === null) return [];
    return [
      {
        id: measurement.id,
        date: measurement.date,
        value,
        ...(measurement.pointToCare === undefined ? {} : { pointToCare: measurement.pointToCare }),
      },
    ];
  });
}

export interface GrowthPanelProps {
  childId: string;
  childName: string;
  sex: "female" | "male" | null;
  dateOfBirth: string;
  /** Today in the profile's zone, from the API. */
  today: string;
  /** The profile's units, the toggle's first position. */
  units: UnitSystem;
  /** Oldest first, as the API answered. */
  measurements: ChildMeasurement[];
  /** She can add a measurement. */
  canWrite: boolean;
  /** A guardian's view (the answer carried the guardians), or anyone else's. */
  viewer: "owner" | "partner";
}

interface Fields {
  date?: string;
  weight?: string;
  length?: string;
  head?: string;
}

/**
 * Growth (DESIGN.md 6.5): the chart for weight, length or head
 * circumference with the 2.3rd to 97.7th band, the median, the frond curl,
 * the period pills and the caption, a unit toggle that redraws the stored SI
 * values at the edge, the pointing-to-care sentence when the API flags a
 * measurement (a guardian's view only), and the WHO and CDC attribution
 * SOURCES.md requires. "Add a measurement" opens a sheet whose fields share
 * the same unit control.
 */
export function GrowthPanel({
  childId,
  childName,
  sex,
  dateOfBirth,
  today,
  units,
  measurements,
  canWrite,
  viewer,
}: GrowthPanelProps) {
  const router = useRouter();
  const [unit, setUnit] = useState<UnitSystem>(units);
  const [indicator, setIndicator] = useState<ChartIndicator>("weightForAge");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(0);
  const [date, setDate] = useState<string | null>(today);
  const [weight, setWeight] = useState<number | null>(null);
  const [length, setLength] = useState<number | null>(null);
  const [head, setHead] = useState<number | null>(null);
  const [errors, setErrors] = useState<Fields>({});
  const [failure, setFailure] = useState<{ text: string; id: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<number | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const busy = useRef(false);
  const lines = useRef(0);

  function nextId(): number {
    lines.current += 1;
    return lines.current;
  }

  function reset() {
    setForm((value) => value + 1);
    setDate(today);
    setWeight(null);
    setLength(null);
    setHead(null);
    setErrors({});
    setFailure(null);
    attempt.current = null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const found: Fields = {};
    if (date === null) found.date = copy.dateMissing;
    else if (date > today) found.date = copy.dateAhead;
    if (weight === null && length === null && head === null) found.weight = copy.nothing;
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0 || date === null) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setFailure({ text: familyCopy.failure.offline, id: nextId() });
      return;
    }
    const body: NewMeasurement = {
      date,
      ...(weight === null ? {} : { weightGrams: weight }),
      ...(length === null ? {} : { lengthMillimetres: length }),
      ...(head === null ? {} : { headMillimetres: head }),
    };
    const client = browserApiClient();
    const current = attemptFor(client, attempt.current, body);
    attempt.current = current;
    busy.current = true;
    setPending(true);
    const result = await addMeasurement(client, childId, body, current);
    busy.current = false;
    setPending(false);
    if (result.ok) {
      reset();
      setOpen(false);
      setNotice(nextId());
      router.refresh();
      return;
    }
    if (!keepsAttempt(result)) attempt.current = null;
    if (result.kind === "invalid" && result.errors.length > 0) {
      const fields: Fields = {};
      for (const { path } of result.errors) {
        if (path === "date") fields.date = copy.beforeBirth(childName);
        else if (path === "weightGrams") fields.weight = copy.checkValue;
        else if (path === "lengthMillimetres") fields.length = copy.checkValue;
        else if (path === "headMillimetres") fields.head = copy.checkValue;
      }
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        return;
      }
    }
    setFailure({ text: failureLine(result, copy.failed), id: nextId() });
  }

  const unitOptions = (["metric", "imperial"] as const).map((value) => ({
    value,
    label:
      indicator === "weightForAge" ? copy.unitLabels.weight[value] : copy.unitLabels.length[value],
  }));
  const formUnitOptions = (["metric", "imperial"] as const).map((value) => ({
    value,
    label: copy.unitLabels.form[value],
  }));

  const charted = measurements.length > 0 && sex !== null;
  let body: ReactNode;
  if (measurements.length === 0) {
    body = (
      <EmptyState
        level={3}
        heading={copy.empty.heading}
        why={copy.empty.why}
        action={
          canWrite ? <Button onClick={() => setOpen(true)}>{copy.empty.action}</Button> : undefined
        }
      />
    );
  } else if (sex === null) {
    body = (
      <>
        <p className={styles.owner}>{copy.noSex}</p>
        <ol className={styles.readings} aria-label={copy.readingsLabel}>
          {measurements.map((measurement) => (
            <li key={measurement.id}>
              <time dateTime={measurement.date}>{formatDay(measurement.date)}</time>
              {": "}
              {indicators
                .flatMap((each) => {
                  const value = valueOf(measurement, each);
                  return value === null
                    ? []
                    : [
                        `${copy.indicators[each]} ${displayFromSi(each, unit, value).toFixed(1)} ${displayUnit(each, unit)}`,
                      ];
                })
                .join(", ")}
            </li>
          ))}
        </ol>
      </>
    );
  } else {
    body = (
      <>
        <SegmentedControl<ChartIndicator>
          label={copy.measure}
          hideLabel
          options={indicatorOptions}
          value={indicator}
          onChange={setIndicator}
        />
        <MeasurementChart
          key={indicator}
          sex={sex}
          indicator={indicator}
          birthDate={dateOfBirth}
          today={today}
          measurements={chartSeries(measurements, indicator)}
          units={unit}
          viewer={viewer}
          addHref={null}
        />
      </>
    );
  }

  return (
    <div className={styles.stack}>
      {body}
      {measurements.length > 0 ? (
        // The sketch's last row: "[Add a measurement]" with the unit toggle beside it.
        <div className={styles.controls}>
          {canWrite ? (
            <Button
              variant="secondary"
              icon="plus"
              onClick={() => {
                setNotice(null);
                setOpen(true);
              }}
            >
              {copy.add}
            </Button>
          ) : null}
          <SegmentedControl<UnitSystem>
            label={copy.units}
            hideLabel
            options={unitOptions}
            value={unit}
            onChange={setUnit}
          />
        </div>
      ) : null}
      {notice !== null ? (
        <InlineFeedback key={notice} tone="success" cue>
          {copy.added}
        </InlineFeedback>
      ) : null}
      {charted ? (
        <div className={styles.attribution}>
          <p>{copy.cdcAttribution}</p>
          <p>
            {copy.whoAttribution}{" "}
            <TextLink href={copy.whoUrl} external>
              {copy.whoUrl.replace(/^https:\/\//, "")}
            </TextLink>
            . {copy.whoAcknowledgment}
          </p>
        </div>
      ) : null}
      {canWrite ? (
        <BottomSheet
          open={open}
          onClose={() => {
            setOpen(false);
            setFailure(null);
          }}
          title={copy.addTitle(childName)}
        >
          <form key={form} className={styles.sheetForm} onSubmit={submit} noValidate>
            <SegmentedDateInput
              label={copy.date}
              order="mdy"
              defaultValue={today}
              example={today}
              onChange={setDate}
              error={errors.date}
              required
            />
            <SegmentedControl<UnitSystem>
              label={copy.units}
              options={formUnitOptions}
              value={unit}
              onChange={setUnit}
            />
            <p className={styles.help}>{copy.help}</p>
            <MeasurementInput
              label={copy.weight}
              kind="weight"
              value={weight}
              onChange={setWeight}
              unit={unit}
              hideUnitToggle
              error={errors.weight}
            />
            <MeasurementInput
              label={copy.length}
              kind="length"
              value={length}
              onChange={setLength}
              unit={unit}
              hideUnitToggle
              error={errors.length}
            />
            <MeasurementInput
              label={copy.head}
              kind="length"
              value={head}
              onChange={setHead}
              unit={unit}
              hideUnitToggle
              error={errors.head}
            />
            {failure !== null ? (
              <InlineFeedback key={failure.id} tone="error" cue>
                {failure.text}
              </InlineFeedback>
            ) : null}
            <div className={styles.actions}>
              <Button type="submit" loading={pending} loadingText={copy.saving}>
                {copy.save}
              </Button>
            </div>
          </form>
        </BottomSheet>
      ) : null}
    </div>
  );
}
