"use client";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { CHILD_CONSENT_DISCLOSURES } from "@tidefern/schemas";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { FormField } from "@/components/ui/form-field";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SegmentedDateInput } from "@/components/ui/segmented-date-input";
import { TextInput } from "@/components/ui/text-input";
import { browserApiClient } from "@/lib/api-browser";
import { failureLine, familyCopy } from "./copy";
import {
  CHILD_CONSENT_VERSION,
  addChild,
  attemptFor,
  keepsAttempt,
  type Attempt,
} from "./mutations";
import styles from "./family.module.css";

const copy = familyCopy.addChild;

type SexChoice = "unset" | "female" | "male";

const sexOptions = (["unset", "female", "male"] as const).map((value) => ({
  value,
  label: copy.sexes[value],
}));

interface Errors {
  name?: string;
  date?: string;
  consent?: string;
}

/** The field errors a 422 named, in this form's words; anything else is the form's own line. */
function fieldErrors(errors: { path: string }[]): { fields: Errors; other: boolean } {
  const fields: Errors = {};
  let other = false;
  for (const { path } of errors) {
    if (path === "displayName") fields.name = copy.nameMissing;
    else if (path === "dateOfBirth") fields.date = copy.dateMissing;
    else if (path.startsWith("guardianConsent")) fields.consent = copy.consentMissing;
    else other = true;
  }
  return { fields, other };
}

/**
 * "Add a child" (CONTENT.md, /family): the name, the date of birth, an
 * optional sex, and the guardian's consent on the child's behalf shown in
 * full before its one unchecked box (task E12's `CHILD_CONSENT_DISCLOSURES`,
 * the draft the owner's attorney reviews). The request goes only after she
 * ticks it, with the version of the text she saw; the API writes the consent
 * row with the child in one transaction. The child appears once the page
 * reads again; nothing is shown that the API did not return.
 */
export function AddChild({
  today,
  variant = "secondary",
}: {
  /** Today in the profile's zone, from the API; a date of birth is never after it. */
  today: string;
  variant?: ButtonVariant;
}) {
  const router = useRouter();
  const consentId = useId();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(0);
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(null);
  const [sex, setSex] = useState<SexChoice>("unset");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<{ text: string; id: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const busy = useRef(false);
  const lines = useRef(0);
  const disclosure = CHILD_CONSENT_VERSION
    ? CHILD_CONSENT_DISCLOSURES[CHILD_CONSENT_VERSION]
    : undefined;

  function nextId(): number {
    lines.current += 1;
    return lines.current;
  }

  function reset() {
    setForm((value) => value + 1);
    setName("");
    setDateOfBirth(null);
    setSex("unset");
    setConsent(false);
    setErrors({});
    setFailure(null);
    attempt.current = null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const displayName = name.trim();
    const found: Errors = {};
    if (displayName === "") found.name = copy.nameMissing;
    else if (displayName.length > 80) found.name = copy.nameTooLong;
    if (dateOfBirth === null) found.date = copy.dateMissing;
    else if (dateOfBirth > today) found.date = copy.dateAhead;
    if (!consent) found.consent = copy.consentMissing;
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0 || dateOfBirth === null) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setFailure({ text: familyCopy.failure.offline, id: nextId() });
      return;
    }
    const body = { displayName, dateOfBirth, ...(sex === "unset" ? {} : { sex }) };
    const client = browserApiClient();
    const current = attemptFor(client, attempt.current, body);
    attempt.current = current;
    busy.current = true;
    setPending(true);
    const result = await addChild(client, body, current);
    busy.current = false;
    setPending(false);
    if (result.ok) {
      reset();
      setOpen(false);
      setNotice({ text: copy.added(displayName), id: nextId() });
      router.refresh();
      return;
    }
    if (!keepsAttempt(result)) attempt.current = null;
    if (result.kind === "invalid") {
      const { fields, other } = fieldErrors(result.errors);
      setErrors(fields);
      if (!other && Object.keys(fields).length > 0) return;
    }
    setFailure({ text: failureLine(result, copy.failed), id: nextId() });
  }

  return (
    <div className={styles.addChild}>
      <Button
        variant={variant}
        icon="plus"
        onClick={() => {
          setNotice(null);
          setOpen(true);
        }}
      >
        {copy.action}
      </Button>
      {notice !== null ? (
        <InlineFeedback key={notice.id} tone="success" cue>
          {notice.text}
        </InlineFeedback>
      ) : null}
      <BottomSheet
        open={open}
        onClose={() => {
          setOpen(false);
          setFailure(null);
        }}
        title={copy.title}
      >
        <form key={form} className={styles.sheetForm} onSubmit={submit} noValidate>
          <FormField label={copy.name} help={copy.nameHelp} error={errors.name} required>
            <TextInput
              autoComplete="off"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <SegmentedDateInput
            label={copy.dateOfBirth}
            order="mdy"
            example={today}
            onChange={setDateOfBirth}
            error={errors.date}
            required
          />
          <div className={styles.field}>
            <SegmentedControl<SexChoice>
              label={copy.sex}
              options={sexOptions}
              value={sex}
              onChange={setSex}
            />
            <p className={styles.help}>{copy.sexHelp}</p>
          </div>
          {disclosure === undefined ? null : (
            <section className={styles.consent} aria-labelledby={consentId}>
              <h3 id={consentId} className={styles.consentHeading}>
                {copy.consentHeading}
              </h3>
              <p className={styles.consentText}>{disclosure.text}</p>
              <CheckboxField
                label={copy.consentLabel}
                help={copy.consentVersion(CHILD_CONSENT_VERSION ?? "")}
                checked={consent}
                onChange={(checked) => {
                  setConsent(checked);
                  if (checked) setErrors((current) => ({ ...current, consent: undefined }));
                }}
                error={errors.consent}
                required
              />
            </section>
          )}
          {failure !== null ? (
            <InlineFeedback key={failure.id} tone="error" cue>
              {failure.text}
            </InlineFeedback>
          ) : null}
          <div className={styles.sheetActions}>
            <Button type="submit" loading={pending} loadingText={copy.pending}>
              {copy.submit}
            </Button>
          </div>
        </form>
      </BottomSheet>
    </div>
  );
}
