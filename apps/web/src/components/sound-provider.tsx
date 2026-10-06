"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { QUIET_HOURS_KEY } from "@/lib/quiet-hours";
import { haptic, play, refreshQuietHours, unlockAudio, unlockIfActivated } from "@/lib/sound";

const INTERACTIVE =
  'a[href], button, summary, input, select, textarea, [role="button"], [role="tab"], [role="switch"], [role="option"], [role="menuitem"]';

/** A link: the only control whose click or Enter starts a navigation the person asked for. */
const LINK = "a[href]";

/**
 * The settle cue sounds within this many milliseconds of the click or Enter
 * that started the navigation (architecture 14.1), or not at all. A view
 * that takes longer to arrive gets no cue, so a late sound never lands on a
 * page the person has already started reading.
 */
export const SETTLE_ARM_MS = 600;

/** A path without its trailing slash, so `/design/` and `/design` compare equal. */
function samePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/**
 * The in-app path a click or Enter on this link navigates the current tab
 * to, or null when it does not: a modifier that opens a new tab or window or
 * saves the target, a `target` other than `_self`, a `download`, another
 * origin, or a link to the page already shown (a `#hash` jump).
 */
export function settleDestination(
  link: HTMLAnchorElement,
  input: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey"> & { button?: number },
  currentPath: string | null,
): string | null {
  if ((input.button ?? 0) !== 0) return null;
  if (input.metaKey || input.ctrlKey || input.shiftKey || input.altKey) return null;
  const target = link.getAttribute("target");
  if (target && target !== "_self") return null;
  if (link.hasAttribute("download")) return null;
  let url: URL;
  try {
    url = new URL(link.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  const path = samePath(url.pathname);
  if (currentPath !== null && path === samePath(currentPath)) return null;
  return path;
}

/**
 * Attaches sound and haptic feedback to every interactive element through
 * event delegation, so no component has to opt in. Hover ticks fire for mouse
 * pointers only; press cues fire for pointer and keyboard activation.
 *
 * An element that carries `data-cue` plays that named cue from its own click
 * handler and prints the result beside it (the sound chapter's demo buttons);
 * the provider still unlocks on it but leaves the press cue to it, so one
 * press does not sound twice.
 *
 * The settle cue (architecture 14.1): a plain click or Enter on a link to
 * another page of this app arms a 600 ms window for that link's path; when
 * the route changes to that path while the window is live the cue plays
 * once, as the new view commits. Back, forward, reload and a fresh page load
 * never arm it, and popstate clears a live arm. A button never arms it, so a
 * redirect a form makes after its request stays silent, and a route that
 * lands anywhere but the link's path (a server redirect to sign in) stays
 * silent too. A modifier click, a new-tab or download link and a same-page
 * `#hash` link never arm it.
 *
 * Browsers grant audio only inside an activation-granting input: mouse
 * pointerdown, touch pointerup or touchend, keydown other than Escape, and
 * click. The unlock listens to all of them, so phones work too.
 */
export function SoundProvider() {
  const pathname = usePathname();
  const armed = useRef<{ at: number; path: string } | null>(null);
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    unlockIfActivated();
    const unlock = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") return;
      unlockAudio();
    };
    const arm = (link: HTMLAnchorElement, event: MouseEvent | KeyboardEvent) => {
      const path = settleDestination(link, event, lastPathname.current);
      armed.current = path === null ? null : { at: performance.now(), path };
    };
    const ownsItsCue = (target: Element) =>
      target instanceof HTMLElement && "cue" in target.dataset;
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
      if (!ownsItsCue(target)) play("press");
      if (event.pointerType === "touch") haptic("tap");
    };
    const onPointerUp = (event: PointerEvent) => {
      // Touch activation is granted on pointerup, so the first tap unlocks here and later taps play on pointerdown.
      if (event.pointerType === "mouse") return;
      const target = (event.target as Element | null)?.closest(INTERACTIVE);
      if (target && !ownsItsCue(target) && unlockAudio()?.state !== "running") play("press");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = (event.target as Element | null)?.closest(INTERACTIVE);
      if (!target || event.repeat) return;
      unlockAudio();
      if (!ownsItsCue(target)) play("press");
      if (event.key === "Enter" && target instanceof HTMLAnchorElement && target.matches(LINK))
        arm(target, event);
    };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest(LINK);
      if (link instanceof HTMLAnchorElement) arm(link, event);
    };
    const onPopState = () => {
      armed.current = null;
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === QUIET_HOURS_KEY || event.key === null) refreshQuietHours();
    };
    const unlockEvents = ["pointerdown", "pointerup", "touchend", "keydown", "click"] as const;
    for (const name of unlockEvents)
      document.addEventListener(name, unlock, { capture: true, passive: true });
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("storage", onStorage);
    return () => {
      for (const name of unlockEvents) document.removeEventListener(name, unlock, true);
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    // The first render is a page load, which never settles; only a later route change can.
    if (lastPathname.current === null) {
      lastPathname.current = pathname;
      return;
    }
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    const arm = armed.current;
    armed.current = null;
    if (arm === null || performance.now() - arm.at > SETTLE_ARM_MS) return;
    // A route other than the link's own is a redirect, which never settles.
    if (samePath(pathname) !== arm.path) return;
    // One task later: the new view has painted, and anything it mounted to listen is listening.
    const timer = setTimeout(() => play("settle"), 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
