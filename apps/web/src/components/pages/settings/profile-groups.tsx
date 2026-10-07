"use client";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import type { NotificationDetail, Stage, Units } from "@tidefern/schemas";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextInput } from "@/components/ui/text-input";
import { TimeZoneCombobox } from "@/components/ui/time-zone-combobox";
import { ChoiceList } from "./choice-list";
import { settingsCopy as copy } from "./copy";
import { LockScreenPreview } from "./lock-screen-preview";
import {
  DISPLAY_NAME_MAX,
  normalizeDisplayName,
  type ProfileChange,
  type SaveOutcome,
} from "./profile-input";
import { leaveFor, useProfile } from "./profile-state";
import { failedState, IDLE, SAVING, SaveStatus, type SaveState } from "./save-status";
import { Help, ReadFailed } from "./settings-frame";
import styles from "./settings.module.css";

/**
 * The groups that edit the profile (DESIGN.md 3.8): name and stage, time
 * zone, units and notification detail. Each reads the page's one profile
 * and saves through its queue (profile-state.tsx), so every PUT carries the
 * whole record and the version the last answer returned. A field the
 * person is editing shows her draft; everything else shows what the API
 * returned. After a save the page is refreshed, so the shell's
 * destinations (which follow the stage) and anything dated in her time zone
 * are read again.
 */

/**
 * A choice that saves as soon as it is made (units, notification detail):
 * the choice shows while its save runs, and the newest choice reports for
 * any made before it, so quick changes end on the API's last answer.
 */
function useChoiceSave<T>(saveChoice: (value: T) => Promise<SaveOutcome>) {
  const router = useRouter();
  const [pending, setPending] = useState<T | null>(null);
  const [state, setState] = useState<SaveState>(IDLE);
  const latest = useRef(0);

  async function choose(value: T) {
    latest.current += 1;
    const turn = latest.current;
    setPending(value);
    setState(SAVING);
    const outcome = await saveChoice(value);
    if (leaveFor(outcome) || turn !== latest.current) return;
    setPending(null);
    if (outcome.kind === "saved") {
      setState({ kind: "saved", text: copy.saved });
      router.refresh();
    } else {
      setState(failedState(outcome));
    }
  }

  return { pending, state, choose };
}

/** Name and stage, saved together with one button. */
export function ProfileForm() {
  const { profile, save } = useProfile();
  const router = useRouter();
  const stageHelpId = useId();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [stageDraft, setStageDraft] = useState<Stage | null>(null);
  const [state, setState] = useState<SaveState>(IDLE);
  if (profile === null) return <ReadFailed />;

  const name = nameDraft ?? profile.displayName ?? "";
  const stage = stageDraft ?? profile.stage;
  const nextName = normalizeDisplayName(name);
  const tooLong = (nextName?.length ?? 0) > DISPLAY_NAME_MAX;
  const changed = nextName !== profile.displayName || stage !== profile.stage;
  const saving = state.kind === "saving";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || tooLong || !changed) return;
    setState(SAVING);
    const change: ProfileChange = { displayName: nextName, stage };
    const outcome = await save(change);
    if (leaveFor(outcome)) return;
    if (outcome.kind === "saved") {
      setNameDraft(null);
      setStageDraft(null);
      setState({ kind: "saved", text: copy.saved });
      router.refresh();
      return;
    }
    // Her draft stays, so she can change it and try again.
    setState(failedState(outcome));
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <FormField
        label={copy.profile.name.label}
        help={copy.profile.name.help}
        error={tooLong ? copy.profile.name.tooLong : undefined}
        className={styles.field}
      >
        <TextInput
          name="displayName"
          autoComplete="nickname"
          value={name}
          maxLength={DISPLAY_NAME_MAX}
          onChange={(event) => setNameDraft(event.target.value)}
        />
      </FormField>
      <div className={styles.control}>
        <ChoiceList
          legend={copy.profile.stage.legend}
          options={copy.profile.stage.options}
          value={stage}
          onChange={setStageDraft}
          describedBy={stageHelpId}
        />
        <Help id={stageHelpId}>{copy.profile.stage.help}</Help>
      </div>
      <div className={styles.control}>
        <div className={styles.actions}>
          <Button
            type="submit"
            loading={saving}
            loadingText={copy.saving}
            disabled={!changed || tooLong}
          >
            {copy.profile.save}
          </Button>
        </div>
        <SaveStatus state={state} />
      </div>
    </form>
  );
}

/** The time zone, chosen from the IANA list and saved with its button. */
export function TimeZoneForm({ now }: { now: string }) {
  const { profile, save } = useProfile();
  const router = useRouter();
  const [zoneDraft, setZoneDraft] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>(IDLE);
  if (profile === null) return <ReadFailed />;

  const zone = zoneDraft ?? profile.timeZone;
  const changed = zone !== profile.timeZone;
  const saving = state.kind === "saving";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !changed) return;
    setState(SAVING);
    const outcome = await save({ timeZone: zone });
    if (leaveFor(outcome)) return;
    if (outcome.kind === "saved") {
      setZoneDraft(null);
      setState({ kind: "saved", text: copy.timeZone.saved(outcome.profile.timeZone) });
      router.refresh();
      return;
    }
    setState(failedState(outcome));
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {/* Keyed by the saved zone: a zone saved here or read back after a refusal starts the field over. */}
      <TimeZoneCombobox
        key={profile.timeZone}
        label={copy.timeZone.field}
        help={copy.timeZone.help}
        value={zone}
        onChange={setZoneDraft}
        now={now}
        className={styles.field}
      />
      <div className={styles.control}>
        <div className={styles.actions}>
          <Button type="submit" loading={saving} loadingText={copy.saving} disabled={!changed}>
            {copy.timeZone.save}
          </Button>
        </div>
        <SaveStatus state={state} />
      </div>
    </form>
  );
}

/** Metric or imperial, saved as soon as it is chosen. */
export function UnitsControl() {
  const { profile, save } = useProfile();
  const { pending, state, choose } = useChoiceSave((units: Units) => save({ units }));
  if (profile === null) return <ReadFailed />;
  return (
    <div className={styles.control}>
      <SegmentedControl
        label={copy.units.label}
        hideLabel
        options={copy.units.options}
        value={pending ?? profile.units}
        onChange={(units) => void choose(units)}
      />
      <Help>{copy.units.help}</Help>
      <SaveStatus state={state} />
    </div>
  );
}

/**
 * The notification detail level (architecture 10.3), saved as soon as it is
 * chosen, with the lock-screen preview for the level on screen and the
 * sentence that email never changes.
 */
export function NotificationsControl() {
  const { profile, save } = useProfile();
  const { pending, state, choose } = useChoiceSave((notificationDetail: NotificationDetail) =>
    save({ notificationDetail }),
  );
  if (profile === null) return <ReadFailed />;
  const detail = pending ?? profile.notificationDetail;
  return (
    <>
      <div className={styles.control}>
        <SegmentedControl
          label={copy.notifications.legend}
          options={copy.notifications.options}
          value={detail}
          onChange={(next) => void choose(next)}
        />
        <Help>{copy.notifications.help}</Help>
        <SaveStatus state={state} />
      </div>
      <LockScreenPreview detail={detail} />
      <p className={styles.email}>{copy.notifications.email}</p>
    </>
  );
}
