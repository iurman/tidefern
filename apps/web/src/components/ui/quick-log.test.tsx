import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import { QuickLogProvider, useQuickLog } from "./quick-log";

function Page({ onOpen }: { onOpen: () => void }) {
  const opener = useCallback(() => onOpen(), [onOpen]);
  useQuickLog(opener);
  return <p>Today content</p>;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <QuickLogProvider>
      {(onQuickLog) => (
        <AppShell stage="cycle" hasChild={false} current="today" onQuickLog={onQuickLog}>
          {children}
        </AppShell>
      )}
    </QuickLogProvider>
  );
}

describe("the quick-log action", () => {
  it("runs the opener the page on screen registered, from the rail and the tab bar", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <Shell>
        <Page onOpen={onOpen} />
      </Shell>,
    );
    const buttons = screen.getAllByRole("button", { name: "Log today" });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) await user.click(button);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("does nothing once the page that registered it is gone", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { rerender } = render(
      <Shell>
        <Page onOpen={onOpen} />
      </Shell>,
    );
    rerender(
      <Shell>
        <p>Another page</p>
      </Shell>,
    );
    for (const button of screen.getAllByRole("button", { name: "Log today" })) {
      await user.click(button);
    }
    expect(onOpen).not.toHaveBeenCalled();
  });
});
