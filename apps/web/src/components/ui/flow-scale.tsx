"use client";
import { FlowLevel } from "@tidefern/schemas";
import { SegmentedControl } from "./segmented-control";

export interface FlowScaleProps {
  /** The legend; the caller names it, so the component carries no default copy. */
  label: string;
  /** Controlled value; `null` is a day with no flow logged yet, shown with nothing chosen. */
  value?: FlowLevel | null;
  defaultValue?: FlowLevel;
  onChange?: (value: FlowLevel) => void;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/** Labels for the five schema values, sentence case, in the schema's order with `none` first. */
export const flowLabels: Record<FlowLevel, string> = {
  none: "None",
  spotting: "Spotting",
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
};

export const flowOptions = FlowLevel.options.map((value) => ({ value, label: flowLabels[value] }));

/**
 * The five-value single select for a day's flow (DESIGN.md 5.1): a segmented
 * radio group whose chosen segment sits on the period data color, with `none`
 * first so clearing a day is one tap like any other value. It lays out as
 * columns: the pill where it fits, equal columns on a phone, one value per
 * row where even those would cut a label.
 */
export function FlowScale({
  label,
  value,
  defaultValue,
  onChange,
  error,
  disabled,
  className,
}: FlowScaleProps) {
  return (
    <SegmentedControl<FlowLevel>
      label={label}
      options={flowOptions}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      error={error}
      disabled={disabled}
      tone="period"
      layout="columns"
      className={className}
    />
  );
}
