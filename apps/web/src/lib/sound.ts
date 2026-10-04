import { soundValue } from "@tidefern/design-tokens";

/**
 * Tidefern's interface sound system. Everything is synthesized with the Web
 * Audio API, so there are no audio files to license, download or cache. The
 * context is created on the first user gesture, which is what browser autoplay
 * policies require, and every cue is short, quiet and shaped with ramps so it
 * never clicks. The person can turn it off; that choice is stored locally.
 */

type Cue = "hover" | "press" | "success" | "error" | "toggle";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let lastHover = 0;

const MASTER_GAIN = soundValue("sound-master-gain");
const HOVER_GAIN = soundValue("sound-hover-gain");
const PRESS_GAIN = soundValue("sound-press-gain");
const HOVER_HZ = soundValue("sound-hover-hz");
const PRESS_HZ = soundValue("sound-press-hz");
const MIN_GAP_MS = soundValue("sound-min-gap-ms");

export function soundEnabled(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.sound !== "off";
}

/** Create or resume the shared context. Call from inside a user gesture. */
export function unlockAudio(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  if (!context) {
    context = new AudioContext({ latencyHint: "interactive" });
    master = context.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

interface ToneOptions {
  frequency: number;
  endFrequency?: number;
  type: OscillatorType;
  duration: number;
  gain: number;
  delay?: number;
}

function tone({ frequency, endFrequency, type, duration, gain, delay = 0 }: ToneOptions) {
  if (!context || !master || context.state !== "running") return;
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency)
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(master);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function play(cue: Cue) {
  if (!soundEnabled()) return;
  if (!context) return; // Not unlocked yet; the first gesture unlocks and plays nothing.
  const now = performance.now();
  switch (cue) {
    case "hover":
      if (now - lastHover < MIN_GAP_MS) return;
      lastHover = now;
      tone({ frequency: HOVER_HZ, type: "sine", duration: 0.028, gain: HOVER_GAIN });
      return;
    case "press":
      tone({
        frequency: PRESS_HZ,
        endFrequency: PRESS_HZ * 0.75,
        type: "triangle",
        duration: 0.09,
        gain: PRESS_GAIN,
      });
      return;
    case "toggle":
      tone({
        frequency: PRESS_HZ * 0.75,
        endFrequency: PRESS_HZ,
        type: "triangle",
        duration: 0.09,
        gain: PRESS_GAIN,
      });
      return;
    case "success":
      tone({ frequency: 523.25, type: "sine", duration: 0.12, gain: PRESS_GAIN });
      tone({
        frequency: 783.99,
        type: "sine",
        duration: 0.16,
        gain: PRESS_GAIN * 0.8,
        delay: 0.09,
      });
      return;
    case "error":
      tone({
        frequency: 196,
        endFrequency: 150,
        type: "triangle",
        duration: 0.18,
        gain: PRESS_GAIN,
      });
      return;
  }
}

/** A short haptic tap where the platform supports it. Silent elsewhere. */
export function haptic(pattern: number | number[] = 8) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw without a user activation. Haptics are optional.
  }
}
