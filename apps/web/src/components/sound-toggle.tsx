"use client";
import { SOUND_KEY } from "@/lib/site";
import { play, unlockAudio } from "@/lib/sound";

export function SoundToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.sound === "off" ? "on" : "off";
    root.dataset.sound = next;
    try {
      localStorage.setItem(SOUND_KEY, next);
    } catch {
      // Blocked storage still allows an in-session choice.
    }
    if (next === "on") {
      unlockAudio();
      play("toggle");
    }
  }
  return (
    <button className="control sound-toggle" type="button" onClick={toggle}>
      <span className="when-sound-on">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M4 10v4h4l5 4V6L8 10H4Z" />
          <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
        </svg>
        <span className="sr-only">Turn interface sounds off</span>
      </span>
      <span className="when-sound-off">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M4 10v4h4l5 4V6L8 10H4Z" />
          <path d="M16 9l5 6M21 9l-5 6" />
        </svg>
        <span className="sr-only">Turn interface sounds on</span>
      </span>
    </button>
  );
}
