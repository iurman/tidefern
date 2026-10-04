"use client";
import { useEffect } from "react";
import { haptic, play, unlockAudio } from "@/lib/sound";

const INTERACTIVE =
  'a[href], button, summary, input, select, textarea, [role="button"], [role="tab"], [role="switch"]';

/**
 * Attaches sound and haptic feedback to every interactive element through
 * event delegation, so no component has to opt in. Hover ticks fire for mouse
 * pointers only; press cues fire for pointer and keyboard activation.
 *
 * Browsers grant audio only inside an activation-granting input: mouse
 * pointerdown, touch pointerup or touchend, keydown other than Escape, and
 * click. The unlock listens to all of them, so phones work too.
 */
export function SoundProvider() {
  useEffect(() => {
    const unlock = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") return;
      unlockAudio();
    };
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const target = (event.target as Element | null)?.closest(INTERACTIVE);
      const from = (event.relatedTarget as Element | null)?.closest(INTERACTIVE);
      if (target && target !== from) play("hover");
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest(INTERACTIVE);
      if (!target) return;
      if (event.pointerType === "mouse") unlockAudio();
      play("press");
      if (event.pointerType === "touch") haptic("tap");
    };
    const onPointerUp = (event: PointerEvent) => {
      // Touch activation is granted on pointerup, so the first tap unlocks here and later taps play on pointerdown.
      if (event.pointerType === "mouse") return;
      const target = (event.target as Element | null)?.closest(INTERACTIVE);
      if (target && unlockAudio()?.state !== "running") play("press");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = (event.target as Element | null)?.closest(INTERACTIVE);
      if (!target || event.repeat) return;
      unlockAudio();
      play("press");
    };
    const unlockEvents = ["pointerdown", "pointerup", "touchend", "keydown", "click"] as const;
    for (const name of unlockEvents)
      document.addEventListener(name, unlock, { capture: true, passive: true });
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      for (const name of unlockEvents) document.removeEventListener(name, unlock, true);
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
  return null;
}
