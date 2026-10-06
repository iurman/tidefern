"use client";
import type { Theme } from "@tidefern/design-tokens";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { FormField } from "@/components/ui/form-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { AA_LARGE_AND_NON_TEXT, AA_TEXT, contrast, formatRatio, toHex, verdict } from "./contrast";
import styles from "./pairing-checker.module.css";

export interface PairingRole {
  name: string;
  label: string;
  light: string;
  dark: string;
}

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

const SAMPLE = "Log a day in a few taps, see where you are, and keep notes that stay yours.";

/**
 * A sandboxed pairing checker: pick any two roles and a theme, and the
 * ratio of the pair as the browser paints it is printed with the AA verdict
 * for text (4.5:1) and for large text, interface and data marks (3:1). The
 * preview is a wrapper that pins its own theme; the page reads the running
 * stylesheet and writes nothing, so production tokens never change here.
 * Before JavaScript runs, the default pair's ratio is computed on the
 * server from the token file.
 */
export function PairingChecker({ roles }: { roles: PairingRole[] }) {
  const id = useId();
  const stage = useRef<HTMLDivElement>(null);
  const [foreground, setForeground] = useState("text");
  const [background, setBackground] = useState("page");
  const [theme, setTheme] = useState<Theme>("light");
  const [measured, setMeasured] = useState<number | null>(null);

  const fg = roles.find((role) => role.name === foreground);
  const bg = roles.find((role) => role.name === background);
  const declared = fg && bg ? contrast(fg[theme], bg[theme]) : null;

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const computed = getComputedStyle(element);
    const ink = toHex(computed.color);
    const fill = toHex(computed.backgroundColor);
    setMeasured(ink && fill ? contrast(ink, fill) : null);
  }, [foreground, background, theme]);

  const ratio = measured ?? declared;
  const textVerdict = ratio === null ? null : verdict(ratio, AA_TEXT);
  const largeVerdict = ratio === null ? null : verdict(ratio, AA_LARGE_AND_NON_TEXT);

  return (
    <div className={styles.checker}>
      <div className={styles.controls}>
        <FormField label="Foreground role" id={`${id}-foreground`}>
          <select
            className={styles.select}
            value={foreground}
            onChange={(event) => setForeground(event.target.value)}
          >
            {roles.map((role) => (
              <option key={role.name} value={role.name}>
                {role.label} (--{role.name})
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Background role" id={`${id}-background`}>
          <select
            className={styles.select}
            value={background}
            onChange={(event) => setBackground(event.target.value)}
          >
            {roles.map((role) => (
              <option key={role.name} value={role.name}>
                {role.label} (--{role.name})
              </option>
            ))}
          </select>
        </FormField>
        <SegmentedControl
          label="Theme"
          options={themes}
          value={theme}
          onChange={(value) => setTheme(value)}
        />
      </div>
      <div
        ref={stage}
        className={styles.stage}
        data-theme={theme}
        data-pairing-stage
        style={
          {
            "--pair-ink": `var(--${foreground})`,
            "--pair-fill": `var(--${background})`,
          } as CSSProperties
        }
        aria-hidden="true"
      >
        <p className={styles.sampleLarge}>Aa</p>
        <p className={styles.sampleText}>{SAMPLE}</p>
        <span className={styles.sampleMark} />
      </div>
      <p className={styles.result} role="status" aria-live="polite" data-pairing-result>
        {ratio === null ? (
          "Pick two roles to measure."
        ) : (
          <>
            <code>--{foreground}</code> on <code>--{background}</code> in {theme}:{" "}
            <strong className="tabular" data-pairing-ratio={ratio.toFixed(2)}>
              {formatRatio(ratio)}
            </strong>
            . Text (4.5:1) <span data-verdict={textVerdict}>{textVerdict}</span>. Large text,
            interface and data marks (3:1) <span data-verdict={largeVerdict}>{largeVerdict}</span>.
            {measured === null
              ? " Computed from the token file."
              : " Measured from the painted preview."}
          </>
        )}
      </p>
    </div>
  );
}
