import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUIET_HOURS_KEY } from "@/lib/quiet-hours";
import { SETTLE_ARM_MS, SoundProvider } from "./sound-provider";

const pathname = { current: "/design" };

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

vi.mock("@/lib/sound", () => ({
  play: vi.fn(() => "played"),
  haptic: vi.fn(() => false),
  unlockAudio: vi.fn(() => null),
  unlockIfActivated: vi.fn(),
  refreshQuietHours: vi.fn(() => null),
}));

const sound = await import("@/lib/sound");
const play = vi.mocked(sound.play);

function pointer(type: "pointerdown" | "pointerup" | "pointerover", pointerType: string) {
  // jsdom has no PointerEvent constructor with pointerType; a plain Event carries it as a property.
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  return event;
}

function mount() {
  document.body.innerHTML = `
    <a id="link" href="/design/sound">Sound</a>
    <button id="button" type="button">Save</button>
    <button id="demo" type="button" data-cue="success">Play</button>
    <p id="text">Nothing</p>
  `;
  // jsdom cannot navigate; the router would take the click in the app.
  document.getElementById("link")!.addEventListener("click", (event) => event.preventDefault());
  return render(<SoundProvider />);
}

beforeEach(() => {
  pathname.current = "/design";
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("delegation", () => {
  it("plays the press cue on pointer down over a control and nothing over text", () => {
    mount();
    document.getElementById("button")!.dispatchEvent(pointer("pointerdown", "mouse"));
    expect(play).toHaveBeenCalledWith("press");
    play.mockClear();
    document.getElementById("text")!.dispatchEvent(pointer("pointerdown", "mouse"));
    expect(play).not.toHaveBeenCalled();
  });

  it("plays the hover tick for a mouse only", () => {
    mount();
    document.getElementById("link")!.dispatchEvent(pointer("pointerover", "touch"));
    expect(play).not.toHaveBeenCalled();
    document.getElementById("link")!.dispatchEvent(pointer("pointerover", "mouse"));
    expect(play).toHaveBeenCalledWith("hover");
  });

  it("plays the press cue on Enter and Space, once per key press", () => {
    mount();
    const button = document.getElementById("button")!;
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: "Enter", repeat: true });
    fireEvent.keyDown(button, { key: " " });
    expect(play.mock.calls.filter(([cue]) => cue === "press")).toHaveLength(2);
    expect(sound.unlockAudio).toHaveBeenCalled();
  });

  it("leaves the press cue to a control that owns its cue", () => {
    mount();
    const demo = document.getElementById("demo")!;
    demo.dispatchEvent(pointer("pointerdown", "mouse"));
    fireEvent.keyDown(demo, { key: "Enter" });
    expect(play).not.toHaveBeenCalled();
    expect(sound.unlockAudio).toHaveBeenCalled();
  });

  it("re-reads quiet hours when another tab changes them", () => {
    mount();
    window.dispatchEvent(new StorageEvent("storage", { key: QUIET_HOURS_KEY, newValue: "{}" }));
    expect(sound.refreshQuietHours).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent("storage", { key: "tidefern-theme-v1" }));
    expect(sound.refreshQuietHours).toHaveBeenCalledTimes(1);
  });
});

describe("the settle cue", () => {
  // The cue is scheduled one task after the route change, so the clock is driven by hand.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function settles() {
    vi.runAllTimers();
    return play.mock.calls.filter(([cue]) => cue === "settle").length;
  }

  it("never plays on the first render", () => {
    mount();
    expect(settles()).toBe(0);
  });

  it("plays once when the route changes after a click on a link", () => {
    const view = mount();
    fireEvent.click(document.getElementById("link")!);
    pathname.current = "/design/sound";
    view.rerender(<SoundProvider />);
    expect(settles()).toBe(1);
    // A re-render on the same route plays nothing more.
    view.rerender(<SoundProvider />);
    expect(settles()).toBe(1);
  });

  it("plays when the route changes after Enter on a link", () => {
    const view = mount();
    fireEvent.keyDown(document.getElementById("link")!, { key: "Enter" });
    pathname.current = "/today";
    view.rerender(<SoundProvider />);
    expect(settles()).toBe(1);
  });

  it("stays silent when a button press is followed by a redirect", () => {
    const view = mount();
    const button = document.getElementById("button")!;
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.click(button);
    pathname.current = "/today";
    view.rerender(<SoundProvider />);
    expect(settles()).toBe(0);
  });

  it("plays inside the 600 ms window and not after it", () => {
    expect(SETTLE_ARM_MS).toBe(600);
    const view = mount();
    fireEvent.click(document.getElementById("link")!);
    vi.advanceTimersByTime(SETTLE_ARM_MS - 50);
    pathname.current = "/design/sound";
    view.rerender(<SoundProvider />);
    expect(settles()).toBe(1);
  });

  it("stays silent on a route change nobody clicked for", () => {
    const view = mount();
    pathname.current = "/design/sound";
    view.rerender(<SoundProvider />);
    expect(settles()).toBe(0);
  });

  it("stays silent after back or forward, which fire popstate", () => {
    const view = mount();
    fireEvent.click(document.getElementById("link")!);
    window.dispatchEvent(new PopStateEvent("popstate"));
    pathname.current = "/";
    view.rerender(<SoundProvider />);
    expect(settles()).toBe(0);
  });

  it("forgets a click older than the arm window", () => {
    const view = mount();
    fireEvent.click(document.getElementById("link")!);
    vi.advanceTimersByTime(SETTLE_ARM_MS + 1);
    pathname.current = "/design/sound";
    view.rerender(<SoundProvider />);
    expect(settles()).toBe(0);
  });

  it("does not count a click on plain text", () => {
    const view = mount();
    fireEvent.click(document.getElementById("text")!);
    pathname.current = "/design/sound";
    view.rerender(<SoundProvider />);
    expect(settles()).toBe(0);
  });
});
