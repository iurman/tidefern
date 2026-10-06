"use client";
import { Icon } from "@/components/icons";
import { SOUND_KEY } from "@/lib/site";
import { play, unlockAudio } from "@/lib/sound";
import styles from "./sound-toggle.module.css";

/**
 * The header control for interface sound. It flips between silent and the
 * full level; Settings offers the middle level, actions only. Turning sound
 * on plays the toggle cue inside the click that unlocked the context, so the
 * person hears what they just allowed.
 */
export function SoundToggle({ className }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.sound === "off" ? "all" : "off";
    root.dataset.sound = next;
    try {
      localStorage.setItem(SOUND_KEY, next);
    } catch {
      // Blocked storage still allows an in-session choice.
    }
    if (next === "all") {
      unlockAudio();
      play("toggle");
    }
  }
  const classes = [styles.toggle, className].filter(Boolean).join(" ");
  return (
    <button className={classes} type="button" onClick={toggle}>
      <span className={styles.whenOn}>
        <Icon name="sound-on" />
        <span className="sr-only">Turn interface sounds off</span>
      </span>
      <span className={styles.whenOff}>
        <Icon name="sound-off" />
        <span className="sr-only">Turn interface sounds on</span>
      </span>
    </button>
  );
}
