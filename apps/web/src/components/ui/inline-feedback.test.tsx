import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InlineFeedback } from "./inline-feedback";

const play = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sound", () => ({ play }));

describe("InlineFeedback", () => {
  beforeEach(() => {
    play.mockReset();
  });

  it("is a polite status that names its tone before the sentence", () => {
    render(<InlineFeedback tone="error">We could not save this day. Try again.</InlineFeedback>);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Error: We could not save this day. Try again.");
    expect(status.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("plays the cue once, only when asked, and never for a note", () => {
    const { rerender } = render(<InlineFeedback tone="success">Saved.</InlineFeedback>);
    expect(play).not.toHaveBeenCalled();
    rerender(
      <InlineFeedback tone="success" cue>
        Saved.
      </InlineFeedback>,
    );
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith("success");
    rerender(
      <InlineFeedback tone="success" cue>
        Saved again.
      </InlineFeedback>,
    );
    expect(play).toHaveBeenCalledTimes(1);
    play.mockReset();
    render(
      <InlineFeedback tone="info" cue>
        Checking your passkey
      </InlineFeedback>,
    );
    expect(play).not.toHaveBeenCalled();
  });
});
