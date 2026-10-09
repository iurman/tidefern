import type { PlayResult } from "@/lib/sound";

/**
 * Every string the sound settings route shows, in one module (architecture
 * 13.10). The route is about interface sound only, so nothing here names a
 * health fact. The result sentences exist because sound never carries
 * meaning alone (architecture 14.1): the person reads what happened whether
 * or not they heard it.
 */
export const soundCopy = {
  title: "Sound",
  description: "Interface sound level and quiet hours, remembered on this device.",
  heading: "Sound",
  lede: "Short, quiet cues when you act. Choose how many you hear and when they stay silent. The choice is remembered on this device only.",
  level: {
    label: "Interface sound",
    help: "All includes the hover tick on a mouse. Actions only keeps presses, saves and errors. Off is silent.",
    options: [
      { value: "all", label: "All" },
      { value: "actions", label: "Actions only" },
      { value: "off", label: "Off" },
    ],
  },
  quiet: {
    heading: "Quiet hours",
    switchLabel: "Use quiet hours",
    switchDescription: "Every cue stays silent between the start and the end, in your day.",
    start: "Start",
    end: "End",
    help: "The window may cross midnight: start in the evening and end in the morning to silence the night.",
    now: "Quiet hours are on right now.",
    later: "Outside quiet hours right now.",
    sameTime: "Start and end are the same time, so nothing is silenced.",
    defaults: { start: "22:00", end: "07:00" },
    loading: "Reading your quiet hours.",
    zone: "Times follow this device's clock until your profile carries a time zone.",
  },
  sample: {
    button: "Play a sample",
    heading: "Hear it",
  },
  related: "Devices",
} as const;

/** The sentence beside the sample button for each result of a play. */
export function describePlayResult(result: PlayResult, cueName = "success cue"): string {
  switch (result) {
    case "played":
      return `That was the ${cueName} at the current level.`;
    case "off":
      return "Sound is off. Choose All or Actions only to hear it.";
    case "quiet":
      return "Quiet hours are on right now, so it stayed silent.";
    case "hidden":
      return "This tab was in the background, so it stayed silent.";
    case "locked":
      return "Your browser has not allowed sound yet. Press the button once more.";
    case "hover-level":
      return "The hover tick plays at the All level only.";
    case "hover-gap":
      return "Hover ticks are at least 90 ms apart; that one was too soon.";
  }
}
