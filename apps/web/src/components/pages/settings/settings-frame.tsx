import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { settingsCopy as copy, settingsPaths } from "./copy";
import styles from "./settings.module.css";

/**
 * The frames the settings screens share (DESIGN.md 3.8). From the rail's
 * width the index stacks every group, each a label beside its controls;
 * below it the index is a list of rows, and each row opens the group on a
 * screen of its own with a link back to Settings.
 */

/** One group on the stacked index: its name as the heading beside its controls. */
export function SettingsGroup({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  const labelId = `settings-${id}`;
  return (
    <section className={styles.group} aria-labelledby={labelId}>
      <h2 id={labelId} className={styles.groupLabel}>
        {label}
      </h2>
      <div className={styles.groupBody}>{children}</div>
    </section>
  );
}

/** A group on its own screen: the way back to Settings, the group's name as the H1, its controls. */
export function GroupScreen({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const titleId = `settings-${id}-title`;
  return (
    <section className={styles.screen} aria-labelledby={titleId}>
      <BackLink href={settingsPaths.index}>{copy.back}</BackLink>
      <h1 id={titleId} className={styles.screenTitle}>
        {title}
      </h1>
      <div className={styles.screenBody}>{children}</div>
    </section>
  );
}

/** One line of help beneath a control (DESIGN.md 3.8: every toggle has one). */
export function Help({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p className={styles.help} id={id}>
      {children}
    </p>
  );
}

/** A group whose read failed: what to do next, in place of its controls. */
export function ReadFailed() {
  return <InlineFeedback tone="error">{copy.readFailed}</InlineFeedback>;
}

/** A group that is a way to another screen: its help line and the link. */
export function LinkGroup({ help, href, label }: { help: string; href: string; label: string }) {
  return (
    <>
      <Help>{help}</Help>
      <Button href={href} variant="secondary">
        {label}
      </Button>
    </>
  );
}

/** Sign out: a POST, never a link a prefetch could follow (the sign-out route refuses GET). */
export function SignOutForm({ className }: { className?: string }) {
  return (
    <form method="post" action="/sign-out" className={className}>
      <Button type="submit" variant="secondary">
        {copy.signOut.action}
      </Button>
    </form>
  );
}

const rows = [
  { href: settingsPaths.profile, label: copy.profile.label },
  { href: settingsPaths.timeZone, label: copy.timeZone.label },
  { href: settingsPaths.units, label: copy.units.label },
  { href: settingsPaths.theme, label: copy.theme.label },
  { href: settingsPaths.sound, label: copy.sound.label },
  { href: settingsPaths.notifications, label: copy.notifications.label },
  { href: settingsPaths.devices, label: copy.devices.label },
  { href: settingsPaths.twoFactor, label: copy.twoFactor.label },
  { href: settingsPaths.export, label: copy.export.label },
  { href: settingsPaths.activity, label: copy.activity.label },
  { href: settingsPaths.consent, label: copy.consent.label },
  { href: settingsPaths.close, label: copy.close.label },
] as const;

/** The phone index (DESIGN.md 3.8): a row per group, each opening its own screen, then sign out. */
export function SettingsSections() {
  return (
    <div className={styles.sections}>
      <nav aria-label={copy.sectionsLabel}>
        <ul className={styles.rows}>
          {rows.map((row) => (
            <li key={row.href}>
              <Link href={row.href} prefetch={false} className={styles.row}>
                <span>{row.label}</span>
                <Icon name="chevron-right" className={styles.rowIcon} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <SignOutForm className={styles.phoneSignOut} />
    </div>
  );
}
