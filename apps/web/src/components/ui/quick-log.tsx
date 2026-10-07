"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/** What the shell's quick-log button does: open the day sheet, or bring the open card into view. */
export type QuickLogOpener = () => void;

type Register = (opener: QuickLogOpener | null) => void;

const QuickLogContext = createContext<Register>(() => {});

/**
 * Carries the quick-log action from the page on screen up to the shell
 * (DESIGN.md 5.1 and 13.7). The shell is drawn by the (app) layout, which
 * cannot hand a page's handler to the rail and the tab bar, so the page
 * registers it here while it is mounted and `children` receives whatever
 * is registered now. The rail and the tab bar show the button only on
 * Today; until Today registers an opener the button does nothing.
 */
export function QuickLogProvider({
  children,
}: {
  children: (opener: QuickLogOpener | undefined) => ReactNode;
}) {
  const [opener, setOpener] = useState<QuickLogOpener | null>(null);
  // A function in state needs the updater form, or React would call it.
  const register = useCallback<Register>((next) => setOpener(() => next), []);
  return (
    <QuickLogContext.Provider value={register}>
      {children(opener ?? undefined)}
    </QuickLogContext.Provider>
  );
}

/**
 * Gives the shell's quick-log button `opener` while the calling component
 * is mounted and takes it back on unmount. Pass a stable function
 * (`useCallback`) so the registration does not churn on every render.
 */
export function useQuickLog(opener: QuickLogOpener | null): void {
  const register = useContext(QuickLogContext);
  useEffect(() => {
    register(opener);
    return () => register(null);
  }, [register, opener]);
}
