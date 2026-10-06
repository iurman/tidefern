"use client";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import styles from "./time-zone-combobox.module.css";

export interface TimeZoneComboboxProps {
  label: string;
  help?: string;
  error?: string;
  /** Controlled zone; pair it with `onChange`. */
  value?: string;
  /** Starting zone when uncontrolled. Never the machine's zone unless the caller passes it. */
  defaultValue?: string;
  onChange?: (zone: string) => void;
  /** The instant the offset is read at, ISO 8601, from the caller. The component never reads the clock. */
  now: string;
  /** The list to search; defaults to the runtime's IANA list. */
  zones?: readonly string[];
  /** Opens the list on mount, for a reference page or a step that is only this field. */
  defaultOpen?: boolean;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** How many matches the list shows before asking for more letters. */
export const MAX_VISIBLE_ZONES = 60;

/** The runtime's IANA list, or nothing where `Intl.supportedValuesOf` is missing. */
export function runtimeTimeZones(): string[] {
  if (typeof Intl.supportedValuesOf !== "function") return [];
  return Intl.supportedValuesOf("timeZone");
}

function searchable(zone: string): string {
  return zone.toLowerCase().replace(/[_/]/g, " ");
}

/**
 * Pure search rule: every word of the query must appear in the zone name with
 * underscores and slashes read as spaces, so "new york" and "york" both find
 * America/New_York. Zones that start with the query sort first.
 */
export function filterZones(zones: readonly string[], query: string): string[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [...zones];
  const matches = zones.filter((zone) => {
    const text = searchable(zone);
    return words.every((word) => text.includes(word));
  });
  const first = words[0] as string;
  return matches.sort((a, b) => {
    const aStarts = searchable(a)
      .split(" ")
      .some((part) => part.startsWith(first))
      ? 0
      : 1;
    const bStarts = searchable(b)
      .split(" ")
      .some((part) => part.startsWith(first))
      ? 0
      : 1;
    return aStarts - bStarts || a.localeCompare(b);
  });
}

/** The zone's UTC offset at `now`, as "GMT+02:00", or null for a zone the runtime does not know. */
export function offsetFor(zone: string, now: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    }).formatToParts(new Date(now));
    const name = parts.find((part) => part.type === "timeZoneName")?.value;
    if (!name) return null;
    return name === "GMT" ? "GMT+00:00" : name;
  } catch {
    return null;
  }
}

/**
 * APG combobox with a listbox popup, editable with list autocomplete: typing
 * filters the IANA list, arrows move through it, Enter chooses, Escape closes
 * and restores the chosen zone. The chosen zone prints with its offset at
 * `now`, so a profile can see what its calendar days follow.
 */
export function TimeZoneCombobox({
  label,
  help,
  error,
  value,
  defaultValue = "",
  onChange,
  now,
  zones,
  defaultOpen = false,
  required,
  disabled,
  id,
  className,
}: TimeZoneComboboxProps) {
  const generated = useId();
  const inputId = id ?? `${generated}-input`;
  const listId = `${inputId}-list`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const offsetId = `${inputId}-offset`;
  const statusId = `${inputId}-status`;

  const [internal, setInternal] = useState(defaultValue);
  const chosen = value ?? internal;
  const [query, setQuery] = useState(chosen);
  const [open, setOpen] = useState(defaultOpen);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const allZones = useMemo(() => zones ?? runtimeTimeZones(), [zones]);
  const matches = useMemo(() => filterZones(allZones, query), [allZones, query]);
  const shown = matches.slice(0, MAX_VISIBLE_ZONES);
  const listed = open && shown.length > 0;
  const offset = chosen ? offsetFor(chosen, now) : null;

  function choose(zone: string) {
    if (value === undefined) setInternal(zone);
    setQuery(zone);
    setOpen(false);
    setActive(-1);
    onChange?.(zone);
  }

  function close(restore: boolean) {
    setOpen(false);
    setActive(-1);
    if (restore) setQuery(chosen);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(event.altKey ? -1 : 0);
        } else if (shown.length) {
          setActive((index) => (index + 1) % shown.length);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(shown.length - 1);
        } else if (shown.length) {
          setActive((index) => (index <= 0 ? shown.length - 1 : index - 1));
        }
        break;
      case "Home":
        if (open && shown.length) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (open && shown.length) {
          event.preventDefault();
          setActive(shown.length - 1);
        }
        break;
      case "Enter":
        if (open && active >= 0 && shown[active]) {
          event.preventDefault();
          choose(shown[active]);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          close(true);
        }
        break;
      case "Tab":
        if (open) close(query.trim() === "" || query !== chosen);
        break;
      default:
        break;
    }
  }

  const describedBy = [
    help ? helpId : null,
    error ? errorId : null,
    offset ? offsetId : null,
    statusId,
  ]
    .filter(Boolean)
    .join(" ");

  const status = !allZones.length
    ? "No time zones are available in this browser."
    : open && !shown.length
      ? `No time zone matches "${query.trim()}". Try a city or a region.`
      : open && matches.length > shown.length
        ? `Showing ${shown.length} of ${matches.length}. Keep typing to narrow the list.`
        : "";

  return (
    <div
      className={[styles.combobox, className].filter(Boolean).join(" ")}
      data-disabled={disabled}
    >
      <label className={styles.label} htmlFor={inputId}>
        {label}
        {required ? <span className={styles.required}> required</span> : null}
      </label>
      {help ? (
        <p className={styles.help} id={helpId}>
          {help}
        </p>
      ) : null}
      <div className={styles.popupAnchor}>
        <input
          ref={inputRef}
          id={inputId}
          className={styles.input}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={listed}
          aria-controls={listed ? listId : undefined}
          aria-activedescendant={listed && active >= 0 ? `${listId}-${active}` : undefined}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={required ? true : undefined}
          required={required}
          disabled={disabled}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onBlur={() => {
            if (open) close(query !== chosen);
          }}
          onKeyDown={onKeyDown}
        />
        {listed ? (
          <ul className={styles.list} id={listId} role="listbox" aria-label={label}>
            {shown.map((zone, index) => (
              <li
                key={zone}
                id={`${listId}-${index}`}
                role="option"
                className={styles.option}
                aria-selected={zone === chosen}
                data-active={index === active ? true : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => {
                  if (active !== index) setActive(index);
                }}
                onClick={() => {
                  choose(zone);
                  inputRef.current?.focus();
                }}
              >
                <span>{zone}</span>
                <span className={styles.offset}>{offsetFor(zone, now)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className={styles.status} id={statusId} aria-live="polite">
          {status}
        </p>
      </div>
      {offset ? (
        <p className={styles.current} id={offsetId}>
          {chosen} is at {offset} right now.
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
