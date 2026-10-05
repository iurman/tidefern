import type { SVGProps } from "react";

/**
 * The project icon set (architecture 13.7): one 24 px grid, 1.6 px stroke,
 * round caps and joins, `currentColor`, no fills. Every icon is paired with
 * visible text or an sr-only name by the component that uses it, so the
 * SVG itself is always `aria-hidden`. Symptom and mood icons join this
 * file when they are drawn and listed in docs/design/ASSETS.md.
 */

const paths = {
  /* Navigation: today is a sunrise over a horizon, a shape no calendar mark or theme toggle uses */
  today: "M4 17h16M7.5 14a4.5 4.5 0 0 1 9 0M12 5.5V8M6.5 8.5 8 10M17.5 8.5 16 10",
  calendar:
    "M5 7.5A1.5 1.5 0 0 1 6.5 6h11A1.5 1.5 0 0 1 19 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17.5v-10ZM5 10.5h14M8.5 4v4M15.5 4v4",
  journey:
    "M4 14c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3M4 18.5c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3M12 4v4M9.5 6.5 12 4l2.5 2.5",
  family:
    "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.5 19c.5-3 2.6-5 5.5-5s5 2 5.5 5M14.5 19c.3-2 1.5-3.6 3.2-4.2 1.7.4 2.6 1.9 2.8 4.2",
  sharing:
    "M8 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM16 17.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM16 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM10.2 8.4l3.6-1.8M10.2 10.6l3.6 1.8M4.5 19c.4-2.3 1.7-3.6 3.5-3.6s3.1 1.3 3.5 3.6",
  settings: "M4 7h7M15 7h5M13 5v4M4 12h3M11 12h9M9 10v4M4 17h10M18 17h2M16 15v4",
  /* Controls */
  "chevron-left": "M14.5 6 8.5 12l6 6",
  "chevron-right": "M9.5 6l6 6-6 6",
  "chevron-down": "M6 9.5l6 6 6-6",
  close: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  plus: "M12 5v14M5 12h14",
  undo: "M9 5 5 9l4 4M5 9h8.5a5 5 0 0 1 0 10H11",
  check: "M5 12.5l4.5 4.5L19 7",
  "sound-on": "M4 10v4h4l5 4V6L8 10H4ZM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11",
  "sound-off": "M4 10v4h4l5 4V6L8 10H4ZM16 9l5 6M21 9l-5 6",
  "theme-light":
    "M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  "theme-dark": "M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z",
  /* Calendar and ring marks */
  period: "M12 4.5c3 3.8 5 6.6 5 9.3a5 5 0 0 1-10 0c0-2.7 2-5.5 5-9.3Z",
  ovulation: "M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z",
  "today-marker": "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
} as const;

export type IconName = keyof typeof paths;

export const iconNames = Object.keys(paths) as IconName[];

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  /** 20 inside controls, 24 in the rail and tab bar. */
  size?: 20 | 24;
}

export function Icon({ name, size = 20, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
