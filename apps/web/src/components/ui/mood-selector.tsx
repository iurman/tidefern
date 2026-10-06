"use client";
import { MoodCode } from "@tidefern/schemas";
import { SegmentedControl } from "./segmented-control";

export interface MoodSelectorProps {
  /** The legend; the caller names it, so the component carries no default copy. */
  label: string;
  value?: MoodCode;
  defaultValue?: MoodCode;
  onChange?: (value: MoodCode) => void;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export const moodLabels: Record<MoodCode, string> = {
  low: "Low",
  steady: "Steady",
  bright: "Bright",
};

export const moodOptions = MoodCode.options.map((value) => ({ value, label: moodLabels[value] }));

/** Three values, single select, as a segmented radio group on the action fill. */
export function MoodSelector({
  label,
  value,
  defaultValue,
  onChange,
  error,
  disabled,
  className,
}: MoodSelectorProps) {
  return (
    <SegmentedControl<MoodCode>
      label={label}
      options={moodOptions}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      error={error}
      disabled={disabled}
      className={className}
    />
  );
}
