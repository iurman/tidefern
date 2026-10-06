import { hapticPattern, soundValue } from "@tidefern/design-tokens";
import {
  isWithinQuietHours,
  minutesOfDay,
  parseQuietHours,
  QUIET_HOURS_KEY,
  serializeQuietHours,
  type QuietHours,
} from "@/lib/quiet-hours";
import { SOUND_KEY } from "@/lib/site";

/**
 * Tidefern's interface sound system. Everything is synthesized with the Web
 * Audio API, so there are no audio files to license, download or cache. One
 * shared context is created or resumed inside the first activation-granting
 * input, which is what browser autoplay policies require. Every cue is short,
 * quiet and shaped with ramps to a positive floor, so nothing clicks. The
 * person can turn it off; that choice is stored on the device.
 */

export type Cue = "hover" | "press" | "toggle" | "success" | "error" | "settle";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let lastHover = 0;

const MASTER_GAIN = soundValue("sound-master-gain");
const HOVER_GAIN = soundValue("sound-hover-gain");
const PRESS_GAIN = soundValue("sound-press-gain");
const SUCCESS_GAIN = soundValue("sound-success-gain");
const HOVER_HZ = soundValue("sound-hover-hz");
const PRESS_HZ = soundValue("sound-press-hz");
const SUCCESS_A = soundValue("sound-success-hz-a");
const SUCCESS_B = soundValue("sound-success-hz-b");
const ERROR_HZ = soundValue("sound-error-hz");
const ERROR_END_HZ = soundValue("sound-error-end-hz");
const MIN_GAP_MS = soundValue("sound-min-gap-ms");
const FLOOR = 0.0001;

/** The master bus level as the tokens set it; the chapter prints it beside the meter. */
export const MASTER_BUS_GAIN = MASTER_GAIN;

/** The positive floor every envelope starts from and decays toward (exponential ramps cannot reach zero). */
export const ENVELOPE_FLOOR = FLOOR;

/** The default attack, in seconds, when a tone does not set its own. */
export const DEFAULT_ATTACK_S = 0.006;

export type SoundLevel = "all" | "actions" | "off";

/** all: every cue including hover. actions: no hover ticks. off: silent. */
export function soundLevel(): SoundLevel {
  if (typeof document === "undefined") return "off";
  const level = document.documentElement.dataset.sound;
  return level === "off" || level === "actions" ? level : "all";
}

export function soundEnabled(): boolean {
  return soundLevel() !== "off";
}

/**
 * Applies a level the way the header control does: on the root before
 * anything else reads it, then in device storage so the next visit starts
 * from the same choice (architecture 14.1, `tidefern-sound-v1`). Blocked
 * storage still allows an in-session choice.
 */
export function setSoundLevel(level: SoundLevel): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.sound = level;
  try {
    localStorage.setItem(SOUND_KEY, level);
  } catch {
    // Blocked storage still allows an in-session choice.
  }
}

type StateListener = (state: AudioContextState | "none") => void;
const stateListeners = new Set<StateListener>();

function notifyState() {
  const state = audioState();
  for (const listener of stateListeners) listener(state);
}

/** The shared context's state, or "none" before the first activation-granting input. */
export function audioState(): AudioContextState | "none" {
  return context?.state ?? "none";
}

/**
 * Hears every change of the shared context's state, including its creation.
 * The chapter shows the unlock rule live with it. Returns the unsubscribe.
 */
export function onAudioState(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/**
 * Create or resume the shared context. Call it from inside a user gesture.
 * The state is read after creation rather than assumed, because a browser
 * may start a context without a gesture (Chrome's media engagement index) or
 * report the standard "interrupted" state after iOS backgrounds the page;
 * resume() covers "suspended" and "interrupted" alike and play() only ever
 * fires while the state is "running".
 */
export function unlockAudio(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  if (!context) {
    context = new AudioContext({ latencyHint: "interactive" });
    master = context.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(context.destination);
    context.addEventListener("statechange", notifyState);
    notifyState();
  }
  if (context.state !== "running") {
    context.resume().catch(() => {
      // The next activation-granting input tries again.
    });
  }
  return context;
}

/**
 * Fast path on mount: when the page already has sticky activation (a
 * client-side navigation after a click, or a tab the person has used), the
 * context can start now instead of waiting for the next input.
 */
export function unlockIfActivated(): void {
  if (typeof navigator === "undefined") return;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation;
  if (activation?.hasBeenActive) unlockAudio();
}

export function audioReady(): boolean {
  return context?.state === "running";
}

/** One synthesized tone: the numbers the chapter prints and the envelope math reads. */
export interface ToneSpec {
  /** Start pitch in hertz, from the token file. */
  frequency: number;
  /** End pitch when the tone glides, reached by an exponential ramp over `decay`. */
  endFrequency?: number;
  type: OscillatorType;
  /** Seconds from the floor to the peak. */
  attack: number;
  /** Seconds of decay; the envelope's time constant is a third of it. */
  decay: number;
  /** Peak gain before the master bus. */
  gain: number;
  /** Seconds after the cue starts, for a second note. */
  delay: number;
}

/** A cue: the tones it schedules, in order, with the words the chapter prints beside them. */
export interface CueSpec {
  cue: Cue;
  /** Sentence case, for a button label: "Hover tick". */
  label: string;
  /** When the provider plays it. */
  when: string;
  /** The token names each number comes from, in the order the tones use them. */
  tokens: string[];
  tones: ToneSpec[];
}

const CUES: Record<Cue, CueSpec> = {
  hover: {
    cue: "hover",
    label: "Hover tick",
    when: "A mouse pointer enters a control, at the all level only, at most one per 90 ms.",
    tokens: ["sound-hover-hz", "sound-hover-gain", "sound-min-gap-ms"],
    tones: [
      {
        frequency: HOVER_HZ,
        type: "sine",
        attack: DEFAULT_ATTACK_S,
        decay: 0.03,
        gain: HOVER_GAIN,
        delay: 0,
      },
    ],
  },
  press: {
    cue: "press",
    label: "Press drop",
    when: "Pointer down or Enter and Space on any control.",
    tokens: ["sound-press-hz", "sound-press-gain"],
    tones: [
      {
        frequency: PRESS_HZ,
        endFrequency: PRESS_HZ * 0.75,
        type: "triangle",
        attack: DEFAULT_ATTACK_S,
        decay: 0.09,
        gain: PRESS_GAIN,
        delay: 0,
      },
    ],
  },
  toggle: {
    cue: "toggle",
    label: "Toggle",
    when: "Sound turned on, from the header or from Settings: the press drop reversed.",
    tokens: ["sound-press-hz", "sound-press-gain"],
    tones: [
      {
        frequency: PRESS_HZ * 0.75,
        endFrequency: PRESS_HZ,
        type: "triangle",
        attack: DEFAULT_ATTACK_S,
        decay: 0.09,
        gain: PRESS_GAIN,
        delay: 0,
      },
    ],
  },
  success: {
    cue: "success",
    label: "Success",
    when: "A save or a grant completed, beside the visible confirmation.",
    tokens: ["sound-success-hz-a", "sound-success-hz-b", "sound-success-gain"],
    tones: [
      {
        frequency: SUCCESS_A,
        type: "sine",
        attack: DEFAULT_ATTACK_S,
        decay: 0.12,
        gain: SUCCESS_GAIN,
        delay: 0,
      },
      {
        frequency: SUCCESS_B,
        type: "sine",
        attack: DEFAULT_ATTACK_S,
        decay: 0.16,
        gain: SUCCESS_GAIN * 0.8,
        delay: 0.09,
      },
    ],
  },
  error: {
    cue: "error",
    label: "Error",
    when: "A validation or request failure, beside the visible error text.",
    tokens: ["sound-error-hz", "sound-error-end-hz", "sound-press-gain"],
    tones: [
      {
        frequency: ERROR_HZ,
        endFrequency: ERROR_END_HZ,
        type: "triangle",
        attack: DEFAULT_ATTACK_S,
        decay: 0.18,
        gain: PRESS_GAIN,
        delay: 0,
      },
    ],
  },
  settle: {
    cue: "settle",
    label: "Settle",
    when: "Once, as a view arrives within 600 ms of a click or Enter on a link; never on back, forward, reload, redirect or page load.",
    tokens: ["sound-success-hz-a", "sound-hover-gain"],
    tones: [
      {
        frequency: SUCCESS_A,
        type: "sine",
        attack: 0.012,
        decay: 0.14,
        gain: HOVER_GAIN,
        delay: 0,
      },
    ],
  },
};

/** The order the chapter lists the cues in. */
export const CUE_ORDER: readonly Cue[] = ["hover", "press", "toggle", "success", "error", "settle"];

/** The spec of one cue, with every number read from the token file. */
export function cueSpec(cue: Cue): CueSpec {
  return CUES[cue];
}

/** Seconds from a tone's own start until its oscillator stops: the attack plus twice the decay. */
export function toneLength(tone: Pick<ToneSpec, "attack" | "decay">): number {
  return tone.attack + tone.decay * 2;
}

/** Seconds from a cue's start until its last tone stops. */
export function cueLength(spec: CueSpec): number {
  return Math.max(...spec.tones.map((tone) => tone.delay + toneLength(tone)));
}

/**
 * The envelope gain at `seconds` after a tone starts, before the master bus:
 * an exponential ramp from the floor to the peak over the attack, then the
 * decay `setTargetAtTime` applies, an exponential approach to the floor with
 * a time constant of a third of the decay. The same curve the audio graph
 * schedules, so the unit tests and the chapter's drawing read one source.
 */
export function envelopeGainAt(
  seconds: number,
  tone: Pick<ToneSpec, "attack" | "decay" | "gain">,
): number {
  if (seconds <= 0) return FLOOR;
  if (seconds < tone.attack) {
    return FLOOR * Math.pow(tone.gain / FLOOR, seconds / tone.attack);
  }
  const constant = tone.decay / 3;
  return FLOOR + (tone.gain - FLOOR) * Math.exp(-(seconds - tone.attack) / constant);
}

/** Linear gain as decibels relative to full scale, rounded to a tenth; the floor reads as silence. */
export function toDecibels(gain: number): number {
  if (gain <= 0) return -Infinity;
  return Math.round(20 * Math.log10(gain) * 10) / 10;
}

/** The peak a cue reaches at the output: its loudest tone times the master bus. */
export function cuePeakGain(spec: CueSpec): number {
  return Math.max(...spec.tones.map((tone) => tone.gain)) * MASTER_GAIN;
}

/** Plus or minus three percent so repeated cues do not sound mechanical. */
function jitter(frequency: number): number {
  return frequency * (1 + (Math.random() - 0.5) * 0.06);
}

function tone({ frequency, endFrequency, type, attack, decay, gain, delay }: ToneSpec) {
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
  oscillator.stop(start + toneLength({ attack, decay }));
}

let quietWindow: QuietHours | null = null;
let quietRead = false;

const quietListeners = new Set<() => void>();

/**
 * Hears every change of the quiet hours, from this tab or another; the
 * settings control reads them through it. Returns the unsubscribe.
 */
export function onQuietHours(listener: () => void): () => void {
  quietListeners.add(listener);
  return () => {
    quietListeners.delete(listener);
  };
}

function readStoredQuietHours(): QuietHours | null {
  quietRead = true;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(QUIET_HOURS_KEY);
  } catch {
    // Blocked storage reads as no quiet hours.
  }
  quietWindow = parseQuietHours(raw);
  return quietWindow;
}

/**
 * The quiet hours stored on this device, read once and kept current by
 * `setQuietHours` and the storage event. The same object comes back until
 * the window changes, so a React store can read it as a snapshot.
 */
export function quietHours(): QuietHours | null {
  if (!quietRead) readStoredQuietHours();
  return quietWindow;
}

/** Re-reads the stored window; the provider calls it when another tab changes it. */
export function refreshQuietHours(): QuietHours | null {
  readStoredQuietHours();
  for (const listener of quietListeners) listener();
  return quietWindow;
}

/** Stores a window, or clears it with null, and applies it to every cue from now on. */
export function setQuietHours(window: QuietHours | null): void {
  quietRead = true;
  quietWindow = window;
  try {
    if (window) localStorage.setItem(QUIET_HOURS_KEY, serializeQuietHours(window));
    else localStorage.removeItem(QUIET_HOURS_KEY);
  } catch {
    // Blocked storage still allows an in-session choice.
  }
  for (const listener of quietListeners) listener();
}

/** True while the device clock sits inside the stored quiet hours. */
export function isQuietNow(now: Date = new Date()): boolean {
  return isWithinQuietHours(quietHours(), minutesOfDay(now));
}

/**
 * Why a cue did or did not sound. Visible text can say it, because sound
 * never carries meaning alone (architecture 14.1).
 */
export type PlayResult = "played" | "off" | "quiet" | "locked" | "hover-level" | "hover-gap";

type PlayListener = (cue: Cue, spec: CueSpec) => void;
const playListeners = new Set<PlayListener>();

/** Hears every cue the moment it is scheduled; the level meter samples while one sounds. */
export function onPlay(listener: PlayListener): () => void {
  playListeners.add(listener);
  return () => {
    playListeners.delete(listener);
  };
}

/** Play a cue. Silent until the context is running and while the person has sound off. */
export function play(cue: Cue): PlayResult {
  if (!soundEnabled()) return "off";
  if (cue === "hover" && soundLevel() !== "all") return "hover-level";
  if (isQuietNow()) return "quiet";
  if (!audioReady()) return "locked";
  if (cue === "hover") {
    const now = performance.now();
    if (now - lastHover < MIN_GAP_MS) return "hover-gap";
    lastHover = now;
  }
  const spec = CUES[cue];
  for (const entry of spec.tones) tone(entry);
  for (const listener of playListeners) listener(cue, spec);
  return "played";
}

/**
 * Play a cue from a click handler: the capture-phase unlock has already
 * created the context, but its first resume settles asynchronously, so the
 * first click waits for it before the cue is scheduled. The result says what
 * happened, for the visible text beside the control.
 */
export async function playAfterUnlock(cue: Cue): Promise<PlayResult> {
  const shared = unlockAudio();
  if (shared && shared.state !== "running") {
    try {
      await shared.resume();
    } catch {
      // The result below says the context is not running.
    }
  }
  return play(cue);
}

/**
 * A reading of the master bus: an analyser after the master gain, created
 * on first use and kept. `peak` is the largest absolute sample in the last
 * block, so a cue's loudest moment shows while it sounds and the bar rests
 * at the floor between cues. Null until the context exists.
 */
export function readMasterPeak(): number | null {
  if (!context || !master) return null;
  if (!analyser) {
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    master.connect(analyser);
  }
  const samples = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  let peak = 0;
  for (const sample of samples) {
    const magnitude = Math.abs(sample);
    if (magnitude > peak) peak = magnitude;
  }
  return peak;
}

export type HapticKind = "tap" | "select" | "success" | "error";

const PATTERNS: Record<HapticKind, number[]> = {
  tap: hapticPattern("haptic-tap-ms"),
  select: hapticPattern("haptic-select-ms"),
  success: hapticPattern("haptic-success-pattern"),
  error: hapticPattern("haptic-error-pattern"),
};

/** The vibration pattern of a kind, in milliseconds on and off, from the token file. */
export function hapticSpec(kind: HapticKind): number[] {
  return PATTERNS[kind];
}

/** Whether this browser exposes the vibration API at all (Chromium on Android does; Safari does not). */
export function hapticsAvailable(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/**
 * A short haptic pulse where the platform supports it (Chromium on Android).
 * Safari has no web vibration API, so iOS stays silent. Never gate UX on it.
 */
export function haptic(kind: HapticKind = "tap"): boolean {
  if (!hapticsAvailable()) return false;
  try {
    return navigator.vibrate(PATTERNS[kind]);
  } catch {
    return false;
  }
}
