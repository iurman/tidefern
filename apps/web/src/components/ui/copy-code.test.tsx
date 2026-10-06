import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CopyCode } from "./copy-code";

const play = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sound", () => ({ play }));

function mockClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

describe("CopyCode", () => {
  beforeEach(() => {
    play.mockReset();
  });

  it("copies the code, says Copied in a live region and plays the success cue once", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    render(<CopyCode label="Usage" code="<Button>Save</Button>" />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("<Button>Save</Button>");
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith("success");
  });

  it("says what to do when the clipboard refuses and plays the error cue", async () => {
    const user = userEvent.setup();
    mockClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    render(<CopyCode code="a" />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Copy failed. Select the text and copy it yourself.",
    );
    expect(play).toHaveBeenCalledWith("error");
  });

  it("fails plainly when there is no clipboard API at all", async () => {
    const user = userEvent.setup();
    mockClipboard(undefined);
    render(<CopyCode code="a" />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByRole("status")).toHaveTextContent("Copy failed");
    expect(play).toHaveBeenCalledWith("error");
  });

  it("starts from a given status and names the block for assistive technology", () => {
    render(<CopyCode label="Theme variables" language="css" code="--page: x;" status="failed" />);
    expect(screen.getByRole("status")).toHaveTextContent("Copy failed");
    expect(screen.getByLabelText("Theme variables")).toHaveTextContent("--page: x;");
    expect(screen.getByText("css")).toBeInTheDocument();
  });

  it("has nothing to copy when the code is empty and disables the button", () => {
    render(<CopyCode code="" />);
    expect(screen.getByText("Nothing to copy yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
  });
});
