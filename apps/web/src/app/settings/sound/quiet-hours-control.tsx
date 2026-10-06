"use client";
import { useId, useSyncExternalStore } from "react";
import { FormField } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import { describeQuietHours, isClockTime, type QuietHours } from "@/lib/quiet-hours";
import { isQuietNow, onQuietHours, quietHours, setQuietHours } from "@/lib/sound";
import { soundCopy as copy } from "./copy";
import styles from "./sound.module.css";

/**
 * Quiet hours (architecture 14.2): a switch, then a start and an end time in
 * the person's day. Turning the switch on stores the default range at once
 * so the sentence under it is never empty; each valid time change is stored
 * as it is made. The range lives on this device until task E2 carries it
 * on the profile, and the clock that decides "now" is the device's until the
 * profile's time zone arrives.
 */
export function QuietHoursControl() {
  const id = useId();
  // Undefined on the server, which cannot read the device; the client reads storage once and hears every change.
  const stored = useSyncExternalStore<QuietHours | null | undefined>(
    onQuietHours,
    quietHours,
    () => undefined,
  );
  const loaded = stored !== undefined;
  const range = stored ?? null;

  function store(next: QuietHours | null) {
    setQuietHours(next);
  }

  function toggle(on: boolean) {
    store(on ? { ...copy.quiet.defaults } : null);
  }

  function changeTime(part: "start" | "end", value: string) {
    if (!range || !isClockTime(value)) return;
    store({ ...range, [part]: value });
  }

  const on = range !== null;
  const quietNow = loaded && isQuietNow();
  const status = !on
    ? null
    : range.start === range.end
      ? copy.quiet.sameTime
      : quietNow
        ? copy.quiet.now
        : copy.quiet.later;
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;

  return (
    <div className={styles.quiet}>
      <div className={styles.switchRow}>
        <div>
          <span id={labelId} className={styles.switchLabel}>
            {copy.quiet.switchLabel}
          </span>
          <p id={descriptionId} className={styles.switchDescription}>
            {copy.quiet.switchDescription}
          </p>
        </div>
        <Switch
          checked={on}
          onChange={toggle}
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          disabled={!loaded}
        />
      </div>
      <div className={styles.times}>
        <FormField label={copy.quiet.start} disabled={!on}>
          {(control) => (
            <input
              {...control}
              className={styles.time}
              type="time"
              value={range?.start ?? copy.quiet.defaults.start}
              onChange={(event) => changeTime("start", event.target.value)}
              step={60}
            />
          )}
        </FormField>
        <FormField label={copy.quiet.end} disabled={!on}>
          {(control) => (
            <input
              {...control}
              className={styles.time}
              type="time"
              value={range?.end ?? copy.quiet.defaults.end}
              onChange={(event) => changeTime("end", event.target.value)}
              step={60}
            />
          )}
        </FormField>
      </div>
      <p className={styles.help}>{copy.quiet.help}</p>
      <p className={styles.status} role="status" aria-live="polite">
        {loaded ? `${describeQuietHours(range)}.` : copy.quiet.loading}
        {status ? ` ${status}` : ""}
      </p>
      <p className={styles.zone}>{copy.quiet.zone}</p>
    </div>
  );
}
