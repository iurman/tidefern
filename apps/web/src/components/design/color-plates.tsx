"use client";
import type { ColorKind, Theme } from "@tidefern/design-tokens";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { contrast, formatRatio, sameColor, toHex, verdict } from "./contrast";
import styles from "./color-plates.module.css";

export interface PlateSample {
  /** The surface role this role is measured on. */
  surface: string;
  /** The ratio computed on the server from the token file's declared values. */
  declared: number;
  threshold: number;
}

export interface Plate {
  name: string;
  label: string;
  use: string;
  kind: ColorKind;
  /** The token file's value for this theme. */
  declared: string;
  samples: PlateSample[];
}

interface Measured {
  resolved: string | null;
  samples: Record<string, number | null>;
}

export const PLATE_PENDING = "Measuring";
export const PLATE_UNSET = "Not set";

/** Which computed property carries the role's color in each sample, by kind. */
function inkProperty(kind: ColorKind): "color" | "backgroundColor" | "borderTopColor" {
  if (kind === "text" || kind === "on-fill") return "color";
  if (kind === "ui") return "borderTopColor";
  return "backgroundColor";
}

/**
 * One theme's column of color plates. Every plate is painted with
 * `var(--token)` inside a wrapper that pins the theme, so both themes show
 * whatever the visitor chose. After paint the browser's resolved value and
 * the ratio of the painted pair are read with `getComputedStyle`, beside the
 * token file's declared value and the ratio computed from it on the server,
 * so the page cannot disagree with the stylesheet (architecture 13.8).
 * Nothing here writes anywhere.
 */
export function ColorPlates({ theme, plates }: { theme: Theme; plates: Plate[] }) {
  const root = useRef<HTMLOListElement>(null);
  const [measured, setMeasured] = useState<Record<string, Measured>>({});

  useEffect(() => {
    const list = root.current;
    if (!list) return;
    const next: Record<string, Measured> = {};
    list.querySelectorAll<HTMLElement>("[data-plate]").forEach((plate) => {
      const name = plate.dataset.plate;
      if (!name) return;
      const chip = plate.querySelector<HTMLElement>("[data-chip]");
      const resolved = chip ? toHex(getComputedStyle(chip).backgroundColor) : null;
      const samples: Record<string, number | null> = {};
      plate.querySelectorAll<HTMLElement>("[data-sample]").forEach((sample) => {
        const surface = sample.dataset.sample;
        const stage = sample.querySelector<HTMLElement>("[data-stage]");
        const ink = sample.querySelector<HTMLElement>("[data-ink]");
        if (!surface || !stage || !ink) return;
        const property = ink.dataset.ink as ReturnType<typeof inkProperty>;
        const background = toHex(getComputedStyle(stage).backgroundColor);
        const foreground = toHex(getComputedStyle(ink)[property]);
        samples[surface] = background && foreground ? contrast(foreground, background) : null;
      });
      next[name] = { resolved: resolved ?? PLATE_UNSET, samples };
    });
    setMeasured(next);
  }, [theme, plates]);

  return (
    <ol className={styles.plates} data-theme={theme} ref={root}>
      {plates.map((plate) => {
        const result = measured[plate.name];
        const resolved = result?.resolved ?? null;
        const differs =
          resolved !== null && resolved !== PLATE_UNSET && !sameColor(resolved, plate.declared);
        return (
          <li
            key={plate.name}
            className={styles.plate}
            data-plate={plate.name}
            data-kind={plate.kind}
            id={`${theme}-${plate.name}`}
          >
            <span
              className={styles.chip}
              data-chip
              style={{ "--plate-fill": `var(--${plate.name})` } as CSSProperties}
              aria-hidden="true"
            />
            <div className={styles.meta}>
              <h3 className={styles.name}>
                <code>--{plate.name}</code>
                <span className={styles.label}>{plate.label}</span>
              </h3>
              <p className={styles.use}>{plate.use}</p>
              <dl className={styles.values}>
                <dt>Declared</dt>
                <dd>
                  <code>{plate.declared}</code>
                </dd>
                <dt>Resolved</dt>
                <dd>
                  <code data-resolved>{resolved ?? PLATE_PENDING}</code>
                  {differs ? (
                    <span className={styles.differs}> differs from the token file</span>
                  ) : null}
                </dd>
              </dl>
              {plate.samples.length > 0 ? (
                <ul className={styles.samples}>
                  {plate.samples.map((sample) => {
                    const live = result?.samples[sample.surface];
                    const ratio = live ?? sample.declared;
                    const outcome = verdict(ratio, sample.threshold);
                    const property = inkProperty(plate.kind);
                    return (
                      <li
                        key={sample.surface}
                        className={styles.sample}
                        data-sample={sample.surface}
                        data-verdict={outcome}
                      >
                        <span
                          className={styles.stage}
                          data-stage
                          style={{ "--stage-fill": `var(--${sample.surface})` } as CSSProperties}
                          aria-hidden="true"
                        >
                          {property === "color" ? (
                            <span
                              className={styles.inkText}
                              data-ink="color"
                              style={{ "--ink": `var(--${plate.name})` } as CSSProperties}
                            >
                              Aa
                            </span>
                          ) : property === "borderTopColor" ? (
                            <span
                              className={styles.inkRing}
                              data-ink="borderTopColor"
                              style={{ "--ink": `var(--${plate.name})` } as CSSProperties}
                            />
                          ) : (
                            <span
                              className={styles.inkMark}
                              data-ink="backgroundColor"
                              style={{ "--ink": `var(--${plate.name})` } as CSSProperties}
                            />
                          )}
                        </span>
                        <span className={styles.ratio}>
                          <strong className="tabular" data-ratio>
                            {formatRatio(ratio)}
                          </strong>{" "}
                          on {sample.surface}, needs {sample.threshold}:1,{" "}
                          <span className={styles.verdict}>{outcome}</span>
                          {live === undefined
                            ? ""
                            : live === null
                              ? " (not measured)"
                              : " (measured)"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
