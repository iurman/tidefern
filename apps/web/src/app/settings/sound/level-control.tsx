"use client";
import { useCallback, useSyncExternalStore } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { play, setSoundLevel, soundLevel, unlockAudio, type SoundLevel } from "@/lib/sound";
import { soundCopy as copy } from "./copy";

/** Hears the sound attribute on the root, so the header control and this one never disagree. */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sound"] });
  return () => observer.disconnect();
}

function getServerLevel(): SoundLevel {
  // The server cannot read the device; the stylesheet's default is all, and the
  // client reads the real choice before the first paint it controls.
  return "all";
}

/**
 * The three-level setting (architecture 14.1): all, actions only, off. A
 * native radio group drawn as segments, the value read from and written to
 * the root attribute and device storage the way the header control does.
 * Turning sound on plays the toggle cue inside the click that allowed it.
 */
export function SoundLevelControl({ className }: { className?: string }) {
  const level = useSyncExternalStore(subscribe, soundLevel, getServerLevel);
  const change = useCallback((next: SoundLevel) => {
    setSoundLevel(next);
    if (next !== "off") {
      unlockAudio();
      play("toggle");
    }
  }, []);
  return (
    <SegmentedControl
      label={copy.level.label}
      options={copy.level.options}
      value={level}
      onChange={change}
      name="sound-level"
      className={className}
    />
  );
}
