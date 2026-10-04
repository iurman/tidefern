import { soundValue } from "@tidefern/design-tokens";

/**
 * Tidefern's interface sound system. Everything is synthesized with the Web
 * Audio API, so there are no audio files to license, download or cache. One
 * shared context is created or resumed inside the first activation-granting
 * input, which is what browser autoplay policies require. Every cue is short,
 * quiet and shaped with ramps to a positive floor, so nothing clicks. The
 * person can turn it off; that choice is stored on the device.
 */

export type Cue = "hover" | "press" | "toggle" | "success" | "error";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let lastHover = 0;

const MASTER_GAIN = soundValue("sound-master-gain");
const HOVER_GAIN = soundValue("sound-hover-gain");
const PRESS_GAIN = soundValue("sound-press-gain");
const HOVER_HZ = soundValue("sound-hover-hz");
const PRESS_HZ = soundValue("sound-press-hz");
const MIN_GAP_MS = soundValue("sound-min-gap-ms");
const FLOOR = 0.0001;

export function soundEnabled(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.sound !== "off";
}

/**
 * Create or resume the shared context. Call it from inside a user gesture.
 * Safari also reports "interrupted" after backgrounding; resume covers both.
 */
export function unlockAudio(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  if (!context) {
    context = new AudioContext({ latencyHint: "interactive" });
    master = context.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(context.destination);
  }
  if (context.state !== "running") {
    context.resume().catch(() => {
      // The next activation-granting input tries again.
    });
  }
  return context;
}

export function audioReady(): boolean {
  return context?.state === "running";
}

interface ToneOptions {
  frequency: number;
  endFrequency?: number;
  type: OscillatorType;
  attack?: number;
  decay: number;
  gain: number;
  delay?: number;
}

/** Plus or minus three percent so repeated cues do not sound mechanical. */
function jitter(frequency: number): number {
  return frequency * (1 + (Math.random() - 0.5) * 0.06);
}

function tone({
  frequency,
  endFrequency,
  type,
  attack = 0.006,
  decay,
  gain,
  delay = 0,
}: ToneOptions) {
  if (!context || !master || context.state !== "running") return;
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(jitter(frequency), start);
  if (endFrequency)
    oscillator.frequency.exponentialRampToValueAtTime(jitter(endFrequency), start + decay);
  // Exponential ramps cannot reach zero, so the envelope rises from a floor and decays toward it.
  envelope.gain.setValueAtTime(FLOOR, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + attack);
  envelope.gain.setTargetAtTime(FLOOR, start + attack, decay / 3);
  oscillator.connect(envelope);
  envelope.connect(master);
  oscillator.start(start);
  oscillator.stop(start + attack + decay * 2);
}

/** Play a cue. Silent until the context is running and while the person has sound off. */
export function play(cue: Cue) {
  if (!soundEnabled() || !audioReady()) return;
  const now = performance.now();
  switch (cue) {
    case "hover":
      if (now - lastHover < MIN_GAP_MS) return;
      lastHover = now;
      tone({ frequency: HOVER_HZ, type: "sine", decay: 0.03, gain: HOVER_GAIN });
      return;
    case "press":
      tone({
        frequency: PRESS_HZ,
        endFrequency: PRESS_HZ * 0.75,
        type: "triangle",
        decay: 0.09,
        gain: PRESS_GAIN,
      });
      return;
    case "toggle":
      tone({
        frequency: PRESS_HZ * 0.75,
        endFrequency: PRESS_HZ,
        type: "triangle",
        decay: 0.09,
        gain: PRESS_GAIN,
      });
      return;
    case "success":
      tone({ frequency: 523.25, type: "sine", decay: 0.12, gain: PRESS_GAIN });
      tone({ frequency: 783.99, type: "sine", decay: 0.16, gain: PRESS_GAIN * 0.8, delay: 0.09 });
      return;
    case "error":
      tone({ frequency: 196, endFrequency: 150, type: "triangle", decay: 0.18, gain: PRESS_GAIN });
      return;
  }
}

export type HapticKind = "tap" | "select" | "success" | "error";

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  select: 4,
  success: [10, 40, 14],
  error: [20, 50, 20, 50, 20],
};

/**
 * A short haptic pulse where the platform supports it (Chromium on Android).
 * Safari has no web vibration API, so iOS stays silent. Never gate UX on it.
 */
export function haptic(kind: HapticKind = "tap"): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  try {
    return navigator.vibrate(PATTERNS[kind]);
  } catch {
    return false;
  }
}
