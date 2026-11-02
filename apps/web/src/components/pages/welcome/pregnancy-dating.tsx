"use client";
import type { DatingMethod } from "@tidefern/schemas";
import { FormField } from "@/components/ui/form-field";
import { SegmentedDateInput } from "@/components/ui/segmented-date-input";
import { TextInput } from "@/components/ui/text-input";
import { welcomeCopy } from "./copy";
import { futureExample, pastExample } from "./dates";
import type { DateOrder, DatingDateField, DatingDraft, DatingField } from "./dates";
import { OptionCards } from "./option-cards";
import styles from "./pregnancy-dating.module.css";

const copy = welcomeCopy.dating;

const METHODS: readonly DatingMethod[] = ["lmp", "ultrasound", "transfer", "manual"];

export interface PregnancyDatingProps {
  value: DatingDraft;
  onChange: (next: DatingDraft) => void;
  /** The words under each field; a date that does not exist is left to the input's own line. */
  errors: Partial<Record<DatingField, string>>;
  order: DateOrder;
  /** Today in her zone, YYYY-MM-DD, for the example lines. */
  today: string;
  /** Prefix of each date field's `data-date-key`, read back with `dateEntryIn` when she continues. */
  keyPrefix?: string;
  disabled?: boolean;
}

/** The `data-date-key` of a dating date field. */
export function datingDateKey(field: DatingDateField, prefix = "dating."): string {
  return `${prefix}${field}`;
}

/**
 * Method-first pregnancy dating (task H1; ACOG CO 700 through core and
 * E4): she says how the due date was worked out, then gives that method's
 * input, and the API computes the due date. The last period's first day; a
 * scan's date with the weeks and days it measured; a transfer's date with
 * the embryo's age; or a due date she was given. "Weeks and days as of a
 * date" is not offered: no method stores it honestly (an owner input).
 * Every date is a segmented input with an example line. Built to be reused
 * by the start flow on /journey (task H4): the caller holds the draft and
 * turns it into the request with `datingFrom` in ./dates.
 */
export function PregnancyDating({
  value,
  onChange,
  errors,
  order,
  today,
  keyPrefix = "dating.",
  disabled,
}: PregnancyDatingProps) {
  const set = (patch: Partial<DatingDraft>) => onChange({ ...value, ...patch });

  function dateField(field: DatingDateField, label: string, example: string) {
    return (
      <div data-date-key={datingDateKey(field, keyPrefix)}>
        <SegmentedDateInput
          label={label}
          order={order}
          example={example}
          required
          defaultValue={value[field] ?? undefined}
          onChange={(date) => set({ [field]: date })}
          error={errors[field]}
          disabled={disabled}
        />
      </div>
    );
  }

  function numberField(field: "weeks" | "days" | "embryoAgeDays", label: string) {
    return (
      <FormField label={label} error={errors[field]} required disabled={disabled}>
        <TextInput
          className={styles.number}
          autoComplete="off"
          inputMode="numeric"
          maxLength={2}
          value={value[field]}
          onChange={(event) => set({ [field]: event.target.value.replace(/\D/g, "") })}
        />
      </FormField>
    );
  }

  return (
    <div className={styles.fields}>
      <OptionCards<DatingMethod>
        legend={copy.methodLabel}
        compact
        options={METHODS.map((method) => ({ value: method, title: copy.methods[method] }))}
        value={value.method}
        onChange={(method) => set({ method })}
        error={errors.method}
        disabled={disabled}
      />
      {value.method === "lmp"
        ? dateField("lastPeriodStart", copy.lastPeriodStart, pastExample(today))
        : null}
      {value.method === "ultrasound" ? (
        <>
          {dateField("scanDate", copy.scanDate, pastExample(today))}
          <fieldset className={styles.age} disabled={disabled}>
            <legend className={styles.legend}>{copy.scanAge}</legend>
            <div className={styles.pair}>
              {numberField("weeks", copy.weeks)}
              {numberField("days", copy.days)}
            </div>
          </fieldset>
        </>
      ) : null}
      {value.method === "transfer" ? (
        <>
          {dateField("transferDate", copy.transferDate, pastExample(today))}
          {numberField("embryoAgeDays", copy.embryoAge)}
        </>
      ) : null}
      {value.method === "manual" ? dateField("dueDate", copy.dueDate, futureExample(today)) : null}
    </div>
  );
}
