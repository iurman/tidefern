"use client";
import { useState } from "react";
import { isSupportedTimeZone } from "@tidefern/schemas";
import { Button } from "@/components/ui/button";
import { TimeZoneCombobox } from "@/components/ui/time-zone-combobox";
import { welcomeCopy } from "./copy";
import styles from "./welcome-flow.module.css";

const copy = welcomeCopy.zone;

/**
 * The browser's own zone, offered as a suggestion and never chosen for her
 * (task H1): null on the server, where there is no browser, and when the
 * browser names a zone the runtime cannot resolve.
 */
export function browserZone(): string | null {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && isSupportedTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

export interface ZoneStepProps {
  value: string;
  onChange: (zone: string) => void;
  error?: string | undefined;
  /** The server's instant, ISO 8601, which the offsets are read at. */
  now: string;
  /** The browser's zone once the page has hydrated, or null. */
  suggestion: string | null;
}

/**
 * Step 1 (DESIGN.md 3.2): "Where are you?" with the IANA time zone
 * combobox. The browser's zone comes first, as a suggestion with its own
 * button; the field stays empty until she picks a zone or takes the
 * suggestion, so nothing is chosen silently. The suggestion sits above the
 * field because the field's list opens below it whenever it has focus,
 * which it takes when she continues without a zone.
 */
export function ZoneStep({ value, onChange, error, now, suggestion }: ZoneStepProps) {
  // The combobox keeps its typed text to itself; a choice made outside it starts a fresh one.
  const [generation, setGeneration] = useState(0);
  return (
    <div className={styles.fields}>
      {suggestion !== null && suggestion !== value ? (
        <div className={styles.suggestion}>
          <p className={styles.note}>{copy.suggestion(suggestion)}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onChange(suggestion);
              setGeneration((count) => count + 1);
            }}
          >
            {copy.useSuggestion(suggestion)}
          </Button>
        </div>
      ) : null}
      <TimeZoneCombobox
        key={generation}
        label={copy.label}
        help={copy.help}
        value={value}
        onChange={onChange}
        now={now}
        required
        error={error}
      />
    </div>
  );
}
