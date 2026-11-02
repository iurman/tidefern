"use client";
import { useId, useState } from "react";
import {
  fluidOuncesFromMillilitres,
  gramsFromPoundsOunces,
  inchesFromMillimetres,
  millilitresFromFluidOunces,
  millimetresFromInches,
  poundsOuncesFromGrams,
} from "@tidefern/core";
import { SegmentedControl } from "./segmented-control";
import styles from "./measurement-input.module.css";

export type MeasurementKind = "weight" | "length" | "volume";
export type UnitSystem = "metric" | "imperial";

export interface MeasurementInputProps {
  label: string;
  /** Decides the SI unit stored: grams, millimetres or millilitres. */
  kind: MeasurementKind;
  help?: string;
  error?: string;
  /** Controlled SI value; pair it with `onChange`. */
  value?: number | null;
  /** Starting SI value when uncontrolled. */
  defaultValue?: number | null;
  /** The SI integer the field now represents, or null while it is blank or not a number. */
  onChange?: (si: number | null) => void;
  unit?: UnitSystem;
  defaultUnit?: UnitSystem;
  onUnitChange?: (unit: UnitSystem) => void;
  /**
   * Leaves the field's own toggle out, for a form whose one unit control
   * drives every field through `unit` (the growth form's weight, length and
   * head circumference share one).
   */
  hideUnitToggle?: boolean;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** What the person types: one field, or two for pounds and ounces. */
export interface DisplayFields {
  primary: string;
  secondary?: string;
}

interface UnitShape {
  primary: { suffix: string; mode: "decimal" | "numeric" };
  secondary?: { suffix: string; mode: "decimal" | "numeric" };
  options: { value: UnitSystem; label: string }[];
}

const shapes: Record<MeasurementKind, Record<UnitSystem, UnitShape>> = {
  weight: {
    metric: {
      primary: { suffix: "kg", mode: "decimal" },
      options: [
        { value: "metric", label: "Kilograms" },
        { value: "imperial", label: "Pounds and ounces" },
      ],
    },
    imperial: {
      primary: { suffix: "lb", mode: "numeric" },
      secondary: { suffix: "oz", mode: "decimal" },
      options: [
        { value: "metric", label: "Kilograms" },
        { value: "imperial", label: "Pounds and ounces" },
      ],
    },
  },
  length: {
    metric: {
      primary: { suffix: "cm", mode: "decimal" },
      options: [
        { value: "metric", label: "Centimetres" },
        { value: "imperial", label: "Inches" },
      ],
    },
    imperial: {
      primary: { suffix: "in", mode: "decimal" },
      options: [
        { value: "metric", label: "Centimetres" },
        { value: "imperial", label: "Inches" },
      ],
    },
  },
  volume: {
    metric: {
      primary: { suffix: "ml", mode: "numeric" },
      options: [
        { value: "metric", label: "Millilitres" },
        { value: "imperial", label: "Fluid ounces" },
      ],
    },
    imperial: {
      primary: { suffix: "fl oz", mode: "decimal" },
      options: [
        { value: "metric", label: "Millilitres" },
        { value: "imperial", label: "Fluid ounces" },
      ],
    },
  },
};

function trimNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

/** The stored SI integer as the strings the field shows in the chosen unit system. */
export function toDisplay(
  kind: MeasurementKind,
  unit: UnitSystem,
  si: number | null,
): DisplayFields {
  if (si === null || !Number.isFinite(si)) {
    return unit === "imperial" && kind === "weight"
      ? { primary: "", secondary: "" }
      : { primary: "" };
  }
  switch (kind) {
    case "weight":
      if (unit === "metric") return { primary: trimNumber(si / 1000) };
      {
        const { pounds, ounces } = poundsOuncesFromGrams(si);
        return { primary: String(pounds), secondary: trimNumber(ounces) };
      }
    case "length":
      return unit === "metric"
        ? { primary: trimNumber(Math.round(si) / 10) }
        : { primary: trimNumber(inchesFromMillimetres(si)) };
    case "volume":
      return unit === "metric"
        ? { primary: String(Math.round(si)) }
        : { primary: trimNumber(fluidOuncesFromMillilitres(si)) };
  }
}

function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (cleaned === "" || cleaned === ".") return null;
  const number = Number(cleaned);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** What the person typed, in the chosen unit system, as the SI integer to store; null while incomplete. */
export function toSi(
  kind: MeasurementKind,
  unit: UnitSystem,
  fields: DisplayFields,
): number | null {
  const primary = parseNumber(fields.primary);
  switch (kind) {
    case "weight":
      if (unit === "metric") return primary === null ? null : Math.round(primary * 1000);
      {
        const ounces = parseNumber(fields.secondary ?? "");
        if (primary === null && ounces === null) return null;
        return gramsFromPoundsOunces(primary ?? 0, ounces ?? 0);
      }
    case "length":
      if (primary === null) return null;
      return unit === "metric" ? Math.round(primary * 10) : millimetresFromInches(primary);
    case "volume":
      if (primary === null) return null;
      return unit === "metric" ? Math.round(primary) : millilitresFromFluidOunces(primary);
  }
}

/**
 * A number with a unit toggle. The field holds the SI integer core stores
 * (grams, millimetres, millilitres) and converts at the edge with core's
 * exact factors; flipping the toggle redraws the same stored value in the
 * other system, so nothing is lost or double rounded.
 */
export function MeasurementInput({
  label,
  kind,
  help,
  error,
  value,
  defaultValue = null,
  onChange,
  unit,
  defaultUnit = "metric",
  onUnitChange,
  hideUnitToggle = false,
  required,
  disabled,
  id,
  className,
}: MeasurementInputProps) {
  const generated = useId();
  const inputId = id ?? `${generated}-measure`;
  const secondaryId = `${inputId}-secondary`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  const [internalUnit, setInternalUnit] = useState<UnitSystem>(defaultUnit);
  const system = unit ?? internalUnit;
  const [si, setSi] = useState<number | null>(defaultValue);
  const stored = value !== undefined ? value : si;
  const [fields, setFields] = useState<DisplayFields>(() => toDisplay(kind, system, stored));
  const [seen, setSeen] = useState({ system, stored });
  if (seen.system !== system || (value !== undefined && seen.stored !== value)) {
    setSeen({ system, stored });
    setFields(toDisplay(kind, system, stored));
  }

  const shape = shapes[kind][system];
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ");

  function type(next: DisplayFields) {
    setFields(next);
    const result = toSi(kind, system, next);
    setSeen({ system, stored: result });
    if (value === undefined) setSi(result);
    onChange?.(result);
  }

  function switchUnit(next: UnitSystem) {
    if (unit === undefined) setInternalUnit(next);
    onUnitChange?.(next);
  }

  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")} data-disabled={disabled}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
        {required ? <span className={styles.required}> required</span> : null}
      </label>
      {help ? (
        <p className={styles.help} id={helpId}>
          {help}
        </p>
      ) : null}
      <div className={styles.row}>
        <span className={styles.number}>
          <input
            id={inputId}
            className={styles.input}
            type="text"
            inputMode={shape.primary.mode}
            autoComplete="off"
            value={fields.primary}
            disabled={disabled}
            required={required}
            aria-required={required ? true : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            onChange={(event) => type({ ...fields, primary: event.target.value })}
          />
          <span className={styles.suffix} aria-hidden="true">
            {shape.primary.suffix}
          </span>
        </span>
        {shape.secondary ? (
          <span className={styles.number}>
            <label className="sr-only" htmlFor={secondaryId}>
              {label}, ounces
            </label>
            <input
              id={secondaryId}
              className={styles.input}
              type="text"
              inputMode={shape.secondary.mode}
              autoComplete="off"
              value={fields.secondary ?? ""}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
              onChange={(event) => type({ ...fields, secondary: event.target.value })}
            />
            <span className={styles.suffix} aria-hidden="true">
              {shape.secondary.suffix}
            </span>
          </span>
        ) : null}
        {hideUnitToggle ? null : (
          <SegmentedControl<UnitSystem>
            label="Unit"
            hideLabel
            options={shape.options}
            value={system}
            onChange={switchUnit}
            disabled={disabled}
            className={styles.unit}
          />
        )}
      </div>
      {error ? (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
