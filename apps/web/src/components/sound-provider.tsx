"use client";
import { useEffect } from "react";
import { haptic, play, unlockAudio } from "@/lib/sound";

const INTERACTIVE =
  'a[href], button, summary, input, select, textarea, [role="button"], [role="tab"], [role="switch"]';

/**
 * Attaches sound and haptic feedback to every interactive element through
 * event delegation, so no component has to remember to opt in. Hover ticks
 * only fire for mouse pointers; press cues fire for pointer and keyboard.
 */
export function SoundProvider() {
  useEffect(() => {
    const unlock = () => unlockAudio();
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const target = (event.target as Element | null)?.closest(INTERACTIVE);
      const from = (event.relatedTarget as Element | null)?.closest(INTERACTIVE);
      if (target && target !== from) play("hover");
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest(INTERACTIVE);
      if (!target) return;
      unlockAudio();
      play("press");
      if (event.pointerType === "touch") haptic(8);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = (event.target as Element | null)?.closest(INTERACTIVE);
      if (!target || event.repeat) return;
      unlockAudio();
      play("press");
    };
    document.addEventListener("pointerdown", unlock, { capture: true, once: true });
    document.addEventListener("keydown", unlock, { capture: true, once: true });
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
  return null;
}
