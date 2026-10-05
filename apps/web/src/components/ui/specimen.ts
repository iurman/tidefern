import type { ReactNode } from "react";

/**
 * The eight states every shared component documents (architecture 13.7). A
 * specimen renders its component in each one; the frame forces the first
 * three through a `data-state` wrapper and the rest arrive as real props.
 */
export const componentStates = [
  "default",
  "hover",
  "focus-visible",
  "active",
  "disabled",
  "loading",
  "error",
  "empty",
] as const;

export type ComponentState = (typeof componentStates)[number];

export interface Specimen {
  /** Sentence case, as the chapter shows it: "Button, primary". */
  name: string;
  /** Repository path of the component file, used for the source link. */
  source: string;
  /** One copyable usage snippet, TSX. */
  usage: string;
  /** What the keyboard does: which keys move, activate, dismiss. */
  keyboard: string;
  /** States the component has no meaning for; the frame prints "none" instead of rendering. */
  states?: Partial<Record<ComponentState, "none">>;
  /** The real component in the given state. */
  render: (state: ComponentState) => ReactNode;
}

export interface SpecimenGroup {
  /** The route segment under /design/components. */
  slug: string;
  /** Page title in Title Case. */
  title: string;
  /** One or two sentences under the H1. */
  lede: string;
  specimens: Specimen[];
}
