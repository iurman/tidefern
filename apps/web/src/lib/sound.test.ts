import { hapticPattern, soundValue } from "@tidefern/design-tokens";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUIET_HOURS_KEY } from "./quiet-hours";
import {
  CUE_ORDER,
  cueLength,
  cuePeakGain,
  cueSpec,
  DEFAULT_ATTACK_S,
  ENVELOPE_FLOOR,
  envelopeGainAt,
  hapticSpec,
  hapticsAvailable,
  isQuietNow,
  MASTER_BUS_GAIN,
  play,
  quietHours,
  refreshQuietHours,
  setQuietHours,
  setSoundLevel,
  soundLevel,
  toDecibels,
  toneLength,
  unlockAudio,
  type Cue,
  type ToneSpec,
} from "./sound";

/** One tone of a cue; fails the test loudly when the cue has fewer tones than expected. */
function toneOf(cue: Cue, index = 0): ToneSpec {
  const found = cueSpec(cue).tones[index];
  if (!found) throw new Error(`The ${cue} cue has no tone ${index}`);
  return found;
}

beforeEach(() => {
  delete document.documentElement.dataset.sound;
  localStorage.clear();
  setQuietHours(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the envelope", () => {
  const press = toneOf("press");

  it("starts at the floor, never at zero", () => {
    expect(envelopeGainAt(0, press)).toBe(ENVELOPE_FLOOR);
    expect(envelopeGainAt(-1, press)).toBe(ENVELOPE_FLOOR);
    expect(ENVELOPE_FLOOR).toBeGreaterThan(0);
  });

  it("reaches the peak exactly at the end of the attack", () => {
    expect(envelopeGainAt(press.attack, press)).toBeCloseTo(press.gain, 10);
  });

  it("rises exponentially through the attack", () => {
    const quarter = envelopeGainAt(press.attack / 4, press);
    const half = envelopeGainAt(press.attack / 2, press);
    const threeQuarters = envelopeGainAt((press.attack * 3) / 4, press);
    expect(quarter).toBeGreaterThan(ENVELOPE_FLOOR);
    expect(half).toBeGreaterThan(quarter);
    expect(threeQuarters).toBeGreaterThan(half);
    expect(press.gain).toBeGreaterThan(threeQuarters);
    // An exponential ramp: equal time steps multiply the gain by the same factor.
    expect(half / quarter).toBeCloseTo(threeQuarters / half, 6);
  });

  it("decays toward the floor with a time constant of a third of the decay", () => {
    const constant = press.decay / 3;
    const atOneConstant = envelopeGainAt(press.attack + constant, press);
    const expected = ENVELOPE_FLOOR + (press.gain - ENVELOPE_FLOOR) * Math.exp(-1);
    expect(atOneConstant).toBeCloseTo(expected, 10);
    expect(envelopeGainAt(press.attack + press.decay, press)).toBeLessThan(atOneConstant);
  });

  it("is below the audible floor when the oscillator stops", () => {
    const atStop = envelopeGainAt(toneLength(press), press);
    // Six time constants after the peak: under a hundredth of the peak, above the floor.
    expect(atStop).toBeLessThan(press.gain / 100);
    expect(atStop).toBeGreaterThan(ENVELOPE_FLOOR);
    expect(toneLength(press)).toBe(press.attack + press.decay * 2);
  });

  it("keeps every cue well under a second, with the hover tick the shortest", () => {
    for (const cue of CUE_ORDER) {
      expect(cueLength(cueSpec(cue)), cue).toBeLessThan(1);
    }
    expect(cueLength(cueSpec("hover"))).toBeLessThan(cueLength(cueSpec("press")));
    expect(cueLength(cueSpec("success"))).toBeGreaterThan(cueLength(cueSpec("press")));
  });

  it("converts gain to decibels relative to full scale", () => {
    expect(toDecibels(1)).toBe(0);
    expect(toDecibels(0.5)).toBe(-6);
    expect(toDecibels(0.1)).toBe(-20);
    expect(toDecibels(0)).toBe(-Infinity);
  });
});

describe("the cue specs", () => {
  it("read every pitch and level from the token file", () => {
    expect(MASTER_BUS_GAIN).toBe(soundValue("sound-master-gain"));
    expect(toneOf("hover").frequency).toBe(soundValue("sound-hover-hz"));
    expect(toneOf("hover").gain).toBe(soundValue("sound-hover-gain"));
    const press = toneOf("press");
    expect(press.frequency).toBe(soundValue("sound-press-hz"));
    expect(press.endFrequency).toBeCloseTo(soundValue("sound-press-hz") * 0.75, 10);
    expect(press.gain).toBe(soundValue("sound-press-gain"));
    const toggle = toneOf("toggle");
    expect(toggle.frequency).toBeCloseTo(press.endFrequency ?? 0, 10);
    expect(toggle.endFrequency).toBe(press.frequency);
    const first = toneOf("success", 0);
    const second = toneOf("success", 1);
    expect(first.frequency).toBe(soundValue("sound-success-hz-a"));
    expect(second.frequency).toBe(soundValue("sound-success-hz-b"));
    expect(first.gain).toBe(soundValue("sound-success-gain"));
    expect(second.gain).toBeCloseTo(soundValue("sound-success-gain") * 0.8, 10);
    expect(second.delay).toBe(0.09);
    const error = toneOf("error");
    expect(error.frequency).toBe(soundValue("sound-error-hz"));
    expect(error.endFrequency).toBe(soundValue("sound-error-end-hz"));
    const settle = toneOf("settle");
    expect(settle.frequency).toBe(soundValue("sound-success-hz-a"));
    expect(settle.gain).toBe(soundValue("sound-hover-gain"));
  });

  it("keep every output peak quiet and the action cues inside the verified -20 to -33 dBFS band", () => {
    for (const cue of CUE_ORDER) {
      const peak = toDecibels(cuePeakGain(cueSpec(cue)));
      expect(peak, cue).toBeLessThanOrEqual(-20);
      expect(peak, cue).toBeGreaterThanOrEqual(-40);
    }
    // The research pass measured the press and success cues; the hover tick and the settle
    // cue sit lower on purpose (0.05 times the 0.3 bus is -36.5 dBFS).
    for (const cue of ["press", "toggle", "success", "error"] as const) {
      expect(toDecibels(cuePeakGain(cueSpec(cue))), cue).toBeGreaterThanOrEqual(-33);
    }
    expect(toDecibels(cuePeakGain(cueSpec("hover")))).toBe(-36.5);
  });

  it("name the tokens they are built from, and every tone has an attack", () => {
    for (const cue of CUE_ORDER) {
      const spec = cueSpec(cue);
      expect(spec.tokens.length).toBeGreaterThan(0);
      for (const name of spec.tokens) expect(() => soundValue(name)).not.toThrow();
      for (const tone of spec.tones) expect(tone.attack).toBeGreaterThanOrEqual(DEFAULT_ATTACK_S);
    }
  });

  it("read the haptic patterns from the token file", () => {
    expect(hapticSpec("tap")).toEqual(hapticPattern("haptic-tap-ms"));
    expect(hapticSpec("success")).toEqual(hapticPattern("haptic-success-pattern"));
    expect(hapticsAvailable()).toBe(typeof navigator.vibrate === "function");
  });
});

describe("the level", () => {
  it("defaults to all and stores an explicit choice on the device", () => {
    expect(soundLevel()).toBe("all");
    setSoundLevel("actions");
    expect(soundLevel()).toBe("actions");
    expect(localStorage.getItem("tidefern-sound-v1")).toBe("actions");
    setSoundLevel("off");
    expect(document.documentElement.dataset.sound).toBe("off");
  });
});

describe("quiet hours on the device", () => {
  it("are absent until stored and then round trip through storage", () => {
    expect(quietHours()).toBeNull();
    setQuietHours({ start: "22:00", end: "07:00" });
    expect(localStorage.getItem(QUIET_HOURS_KEY)).toBe('{"start":"22:00","end":"07:00"}');
    expect(refreshQuietHours()).toEqual({ start: "22:00", end: "07:00" });
    setQuietHours(null);
    expect(localStorage.getItem(QUIET_HOURS_KEY)).toBeNull();
    expect(quietHours()).toBeNull();
  });

  it("silence the clock inside the window, across midnight too", () => {
    setQuietHours({ start: "22:00", end: "07:00" });
    expect(isQuietNow(new Date(2026, 9, 5, 23, 30))).toBe(true);
    expect(isQuietNow(new Date(2026, 9, 6, 2, 0))).toBe(true);
    expect(isQuietNow(new Date(2026, 9, 6, 7, 0))).toBe(false);
    expect(isQuietNow(new Date(2026, 9, 6, 12, 0))).toBe(false);
  });
});

describe("play", () => {
  it("creates no context outside a browser with Web Audio and reports why it stayed silent", () => {
    // jsdom has no AudioContext: the unlock is a no-op and nothing can sound.
    expect(unlockAudio()).toBeNull();
    expect(play("press")).toBe("locked");
    setSoundLevel("off");
    expect(play("press")).toBe("off");
    setSoundLevel("all");
    setQuietHours({ start: "00:00", end: "23:59" });
    expect(play("success")).toBe("quiet");
    setQuietHours({ start: "00:00", end: "00:00" });
    expect(play("success")).toBe("locked");
  });

  it("drops the hover tick at the actions level before anything else", () => {
    setSoundLevel("actions");
    expect(play("hover")).toBe("hover-level");
    expect(play("press")).toBe("locked");
  });
});
