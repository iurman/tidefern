"use client";
import { useEffect, useState } from "react";
import { cueLength, MASTER_BUS_GAIN, onPlay, readMasterPeak, toDecibels } from "@/lib/sound";
import styles from "@/app/(public)/design/sound/sound.module.css";

/** The meter's floor: anything quieter reads as silence. */
const FLOOR_DB = -60;

/** How long after a cue's last tone stops the meter keeps sampling, so the tail is seen. */
const TAIL_MS = 120;

interface LastCue {
  label: string;
  peakDb: number;
}

function clampDb(gain: number): number {
  const db = toDecibels(gain);
  return Number.isFinite(db) ? Math.max(FLOOR_DB, Math.min(0, db)) : FLOOR_DB;
}

/**
 * The master bus, read from an analyser after the master gain while a cue
 * sounds (architecture 14.2). Sampling starts when a cue is scheduled and
 * stops a tenth of a second after its last tone, so nothing runs between
 * cues and nothing automatic lasts longer than the cue itself. The bus level
 * printed beside it is the token value, not a reading.
 */
export function SoundMeter() {
  const [liveDb, setLiveDb] = useState(FLOOR_DB);
  const [last, setLast] = useState<LastCue | null>(null);

  useEffect(() => {
    let frame = 0;
    let stopAt = 0;
    let peak = 0;
    let label = "";
    const sample = () => {
      const reading = readMasterPeak() ?? 0;
      if (reading > peak) peak = reading;
      setLiveDb(clampDb(reading));
      if (performance.now() < stopAt) {
        frame = requestAnimationFrame(sample);
        return;
      }
      frame = 0;
      setLiveDb(FLOOR_DB);
      setLast({ label, peakDb: clampDb(peak) });
    };
    const unsubscribe = onPlay((_, spec) => {
      if (!frame) peak = 0;
      label = spec.label;
      stopAt = Math.max(stopAt, performance.now() + cueLength(spec) * 1000 + TAIL_MS);
      if (!frame) frame = requestAnimationFrame(sample);
    });
    return () => {
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const busDb = toDecibels(MASTER_BUS_GAIN);
  return (
    <div className={styles.meter}>
      <dl className={styles.meterFacts}>
        <div>
          <dt>Master bus</dt>
          <dd>
            <code>--sound-master-gain</code> {MASTER_BUS_GAIN}, {busDb} dBFS
          </dd>
        </div>
        <div>
          <dt>Live peak</dt>
          <dd className={styles.meterRow}>
            <meter
              className={styles.meterBar}
              min={FLOOR_DB}
              max={0}
              value={liveDb}
              aria-label="Master bus peak, decibels relative to full scale"
            />
            <span className={styles.meterValue}>
              {liveDb <= FLOOR_DB ? "Silent" : `${liveDb} dBFS`}
            </span>
          </dd>
        </div>
        <div>
          <dt>Last cue</dt>
          <dd>
            <span role="status" aria-live="polite" data-last-cue={last?.label ?? ""}>
              {last ? `${last.label}, peak ${last.peakDb} dBFS` : "No cue yet."}
            </span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
