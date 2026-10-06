"use client";
import { useId, useState } from "react";
import { isCalendarDate } from "@tidefern/core";
import type { FlowLevel, MoodCode, SymptomCode } from "@tidefern/schemas";
import { Icon } from "@/components/icons";
import { BottomSheet } from "./bottom-sheet";
import { Button } from "./button";
import { ChipGroup, symptomOptions } from "./chip-group";
import { FlowScale } from "./flow-scale";
import { FormField } from "./form-field";
import { MoodSelector } from "./mood-selector";
import { Switch } from "./switch";
import { Textarea } from "./textarea";
import styles from "./day-sheet.module.css";

/** What a person logs for one calendar day (DESIGN.md 3.4). */
export interface DayEntry {
  period: boolean;
  flow?: FlowLevel;
  symptoms: SymptomCode[];
  mood?: MoodCode;
  /** Free text; encrypted at rest and never shared unless she says so. */
  note: string;
}

export interface DaySheetProps {
  open: boolean;
  onClose: () => void;
  /** The day being logged, `YYYY-MM-DD`. */
  date: string;
  onPrevious?: () => void;
  onNext?: () => void;
  /** What is already logged for the day; absent fields start empty. */
  initial?: Partial<DayEntry>;
  onSave: (entry: DayEntry) => void;
  /** Opens the sharing choice for the note; the sheet never shares on its own. */
  onShareNote?: () => void;
  /** The save is in flight: the primary action reads "Saving" and ignores presses. */
  saving?: boolean;
  /** The day is still arriving: the sheet body reads "Loading". */
  loading?: boolean;
  /** What went wrong and what to do next, shown beneath the title. */
  error?: string;
  /** Draws the open sheet in the page flow instead of the top layer. Documentation only. */
  inline?: boolean;
}

const weekdayDate = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "Sunday, Oct 5" from a calendar date string, read as a UTC day so no machine zone shifts it. */
export function formatSheetDate(date: string): string {
  if (!isCalendarDate(date)) throw new Error("formatSheetDate expects YYYY-MM-DD");
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return weekdayDate.format(new Date(Date.UTC(year, month - 1, day)));
}

const emptyEntry: DayEntry = { period: false, symptoms: [], note: "" };

/**
 * The day sheet: the bottom sheet on phones and a dialog from 1024 px, with
 * the period toggle (one press logs, the same press unlogs), the flow scale
 * while a period is logged, the symptom chips, the mood selector and the
 * private note with its explicit sharing action, then Save and Cancel. The
 * sheet keeps a draft and hands it back on Save; it never writes anything
 * itself, so a cancelled draft leaves no trace.
 */
export function DaySheet({
  open,
  onClose,
  date,
  onPrevious,
  onNext,
  initial,
  onSave,
  onShareNote,
  saving = false,
  loading = false,
  error,
  inline = false,
}: DaySheetProps) {
  const [draft, setDraft] = useState<DayEntry>({ ...emptyEntry, ...initial });
  const periodLabelId = useId();
  const periodHelpId = useId();

  function update(patch: Partial<DayEntry>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={formatSheetDate(date)}
      loading={loading}
      error={error}
      inline={inline}
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (saving) return;
          onSave(draft.period ? draft : { ...draft, flow: undefined });
        }}
      >
        <div className={styles.dayNav}>
          <Button variant="quiet" icon="chevron-left" onClick={onPrevious} disabled={!onPrevious}>
            Previous day
          </Button>
          <Button variant="quiet" icon="chevron-right" onClick={onNext} disabled={!onNext}>
            Next day
          </Button>
        </div>

        <div className={styles.periodRow}>
          <div>
            <p id={periodLabelId} className={styles.periodLabel}>
              Period
            </p>
            <p id={periodHelpId} className={styles.periodHelp}>
              One press logs it for this day; the same press takes it back.
            </p>
          </div>
          <Switch
            checked={draft.period}
            onChange={(period) => update({ period })}
            aria-labelledby={periodLabelId}
            aria-describedby={periodHelpId}
            disabled={saving}
          />
        </div>

        {draft.period ? (
          <FlowScale
            label="Flow"
            value={draft.flow ?? "none"}
            onChange={(flow) => update({ flow })}
            disabled={saving}
          />
        ) : null}

        <ChipGroup
          label="Symptoms"
          options={symptomOptions}
          selected={draft.symptoms}
          onChange={(symptoms) => update({ symptoms })}
          visible={6}
          disabled={saving}
        />

        <MoodSelector
          label="Mood"
          value={draft.mood}
          onChange={(mood) => update({ mood })}
          disabled={saving}
        />

        <FormField label="Private note" help="Only you can read this." disabled={saving}>
          {(control) => (
            <Textarea
              {...control}
              autoComplete="off"
              rows={3}
              value={draft.note}
              onChange={(event) => update({ note: event.currentTarget.value })}
            />
          )}
        </FormField>
        <div className={styles.shareRow}>
          <Button
            variant="quiet"
            icon="sharing"
            onClick={onShareNote}
            disabled={!onShareNote || saving}
          >
            Share this note with someone
          </Button>
        </div>

        <div className={styles.actions}>
          <Button type="submit" variant="primary" loading={saving} loadingText="Saving">
            Save
          </Button>
          <Button variant="quiet" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </div>
        <p className={styles.footnote}>
          <Icon name="today-marker" size={20} /> Saved days show a dot on the calendar.
        </p>
      </form>
    </BottomSheet>
  );
}
