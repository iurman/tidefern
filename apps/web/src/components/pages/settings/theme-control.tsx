"use client";
import { useSyncExternalStore } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { settingsCopy as copy } from "./copy";
import { Help } from "./settings-frame";
import {
  applyThemeChoice,
  readThemeChoice,
  subscribeThemeChoice,
  type ThemeChoice,
} from "./theme-choice";
import styles from "./settings.module.css";

function readChoice(): ThemeChoice {
  return readThemeChoice();
}

function serverChoice(): ThemeChoice {
  // The server cannot read the device. The first client render reads the root the pre-paint
  // script already set, so the control shows the real choice before anyone can press it.
  return "system";
}

/**
 * The theme with its third choice (architecture 13.4): follow system, light
 * or dark, applied at once on this device. Nothing reaches the API: the
 * choice is the device's, like the header toggle's.
 */
export function ThemeControl() {
  const choice = useSyncExternalStore(subscribeThemeChoice, readChoice, serverChoice);
  return (
    <div className={styles.control}>
      <SegmentedControl
        label={copy.theme.label}
        hideLabel
        options={copy.theme.options}
        value={choice}
        onChange={applyThemeChoice}
      />
      <Help>{copy.theme.help}</Help>
    </div>
  );
}
