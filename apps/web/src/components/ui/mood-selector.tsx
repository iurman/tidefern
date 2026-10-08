"use client";
import type { ReactNode } from "react";
import { MoodCode } from "@tidefern/schemas";
import { SegmentedControl } from "./segmented-control";

export interface MoodSelectorProps {
  /** The legend; the caller names it, so the component carries no default copy. */
  label: string;
  /** Controlled value; `null` is a day with no mood logged yet, shown with nothing chosen. */
  value?: MoodCode | null;
  defaultValue?: MoodCode;
  onChange?: (value: MoodCode) => void;
  /**
   * A quiet control that belongs to the group, such as the day sheet's
   * Clear: a radio group never unselects by pressing, so going back to
   * nothing chosen is its own control.
   */
  action?: ReactNode;
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

/**
 * Three values, single select, as a segmented radio group on the action
 * fill. It shares the flow scale's columns layout, so in the day sheet the
 * two switch from the pill to equal columns at the same width; its three
 * short labels stay in columns where the flow scale's five stack.
 */
export function MoodSelector({
  label,
  value,
  defaultValue,
  onChange,
  action,
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
      action={action}
      error={error}
      disabled={disabled}
      layout="columns"
      className={className}
    />
  );
}
