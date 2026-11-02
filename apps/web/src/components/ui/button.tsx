"use client";
import Link from "next/link";
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import styles from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";

interface SharedProps {
  variant?: ButtonVariant;
  /** An icon beside the text, never instead of it. */
  icon?: IconName;
  /**
   * Keeps the control's width and swaps the label for `loadingText`. The
   * control stays in the tab order so focus does not jump, and clicks are
   * ignored until it ends.
   */
  loading?: boolean;
  /** What is happening, in the voice table's words: "Saving", "Sending the invitation". */
  loadingText?: string;
  children: ReactNode;
}

interface ButtonAsButton
  extends SharedProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  href?: undefined;
}

interface ButtonAsLink extends SharedProps {
  /** Renders a Next link styled as the button: navigation, not an action. */
  href: string;
  className?: string;
  prefetch?: boolean;
}

export type ButtonProps = ButtonAsButton | ButtonAsLink;

/**
 * The one button (DESIGN.md section 4): primary at 48 px, the others at 44
 * px, in both themes through the semantic tokens. With `href` it becomes a
 * link that looks the same, for "Create an account" style navigation; with
 * `loading` it keeps its width and shows text, never a spinner alone.
 */
export function Button({
  variant = "primary",
  icon,
  loading = false,
  loadingText = "Saving",
  children,
  ...rest
}: ButtonProps) {
  const inner = (
    <>
      {icon ? <Icon name={icon} className={styles.icon} /> : null}
      {/* data-loading-text reserves the loading text's width while idle (the CSS ::after), so pressing never widens the button. */}
      <span className={styles.stack} data-loading-text={loadingText}>
        <span className={styles.label} aria-hidden={loading || undefined}>
          {children}
        </span>
        {loading ? <span className={styles.loadingText}>{loadingText}</span> : null}
      </span>
    </>
  );

  if (rest.href !== undefined) {
    const { href, className, prefetch = false } = rest;
    return (
      <Link
        href={href}
        prefetch={prefetch}
        className={joinClasses(styles.button, styles[variant], className)}
        data-variant={variant}
      >
        {inner}
      </Link>
    );
  }

  const { href, className, type = "button", onClick, disabled, ...native } = rest;
  void href;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      {...native}
      type={type}
      className={joinClasses(styles.button, styles[variant], className)}
      data-variant={variant}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading && !disabled ? true : undefined}
      onClick={handleClick}
    >
      {inner}
    </button>
  );
}

function joinClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
