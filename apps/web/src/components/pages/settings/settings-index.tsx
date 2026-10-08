import type { Me } from "@tidefern/api-client";
import { CloseAccount } from "./close-account";
import { consentView } from "./consent-records";
import { ConsentSection } from "./consent-section";
import { settingsCopy as copy, settingsPaths } from "./copy";
import { ExportControl } from "./export-control";
import { freshForMs } from "./fresh-auth";
import { NotificationsControl, ProfileForm, TimeZoneForm, UnitsControl } from "./profile-groups";
import { ProfileProvider } from "./profile-state";
import {
  readChildNames,
  readConsents,
  readProcessors,
  readProfile,
  serverNow,
  settingsClient,
} from "./server-data";
import { LinkGroup, SettingsGroup, SettingsSections, SignOutForm } from "./settings-frame";
import { ThemeControl } from "./theme-control";
import styles from "./settings.module.css";

/**
 * /settings (DESIGN.md 3.8). Below the rail's width it is the list of rows,
 * each opening its group's own screen; from it every group stacks on this
 * page, a label beside its controls. Both are rendered and the shell's
 * width shows one, so a phone and a desktop each get theirs without
 * JavaScript. The profile, the consents and the processors are read here on
 * the server; with no session read (`me` null, the read failed) the groups
 * that need the API say so and the rest still work.
 */
export async function SettingsIndex({ me }: { me: Me | null }) {
  const now = serverNow();
  const client = me === null ? null : await settingsClient();
  const [profile, consents, processors] =
    client === null
      ? [null, null, null]
      : await Promise.all([readProfile(client), readConsents(client), readProcessors(client)]);
  const needsNames = consents?.some((consent) => consent.consentingGuardianId !== null) ?? false;
  const childNames =
    client !== null && needsNames ? await readChildNames(client) : new Map<string, string>();
  const timeZone = me?.profile?.timeZone ?? profile?.timeZone;
  const view =
    me !== null && consents !== null && timeZone !== undefined
      ? consentView(consents, me.id, timeZone, childNames)
      : null;
  const fresh = freshForMs(me?.session.authenticatedAt, now);

  return (
    <section className={styles.page} aria-labelledby="settings-title">
      <h1 id="settings-title" className={styles.title}>
        {copy.heading}
      </h1>
      <SettingsSections />
      <div className={styles.stack}>
        <ProfileProvider initial={profile}>
          <SettingsGroup id="profile" label={copy.profile.label}>
            <ProfileForm />
          </SettingsGroup>
          <SettingsGroup id="time-zone" label={copy.timeZone.label}>
            <TimeZoneForm now={new Date(now).toISOString()} />
          </SettingsGroup>
          <SettingsGroup id="units" label={copy.units.label}>
            <UnitsControl />
          </SettingsGroup>
          <SettingsGroup id="theme" label={copy.theme.label}>
            <ThemeControl />
          </SettingsGroup>
          <SettingsGroup id="sound" label={copy.sound.label}>
            <LinkGroup help={copy.sound.help} href={settingsPaths.sound} label={copy.sound.link} />
          </SettingsGroup>
          <SettingsGroup id="notifications" label={copy.notifications.label}>
            <NotificationsControl />
          </SettingsGroup>
        </ProfileProvider>
        <SettingsGroup id="devices" label={copy.devices.label}>
          <LinkGroup
            help={copy.devices.help}
            href={settingsPaths.devices}
            label={copy.devices.link}
          />
        </SettingsGroup>
        <SettingsGroup id="two-factor" label={copy.twoFactor.label}>
          <LinkGroup
            help={copy.twoFactor.help}
            href={settingsPaths.twoFactor}
            label={copy.twoFactor.link}
          />
        </SettingsGroup>
        <SettingsGroup id="export" label={copy.export.label}>
          <p className={styles.help}>{copy.export.help}</p>
          <ExportControl returnTo={settingsPaths.index} freshForMs={fresh} />
        </SettingsGroup>
        <SettingsGroup id="activity" label={copy.activity.label}>
          <LinkGroup
            help={copy.activity.help}
            href={settingsPaths.activity}
            label={copy.activity.link}
          />
        </SettingsGroup>
        <SettingsGroup id="consent" label={copy.consent.label}>
          <ConsentSection
            view={view}
            processors={processors}
            returnTo={settingsPaths.index}
            freshForMs={fresh}
            headingLevel={3}
          />
        </SettingsGroup>
        <SettingsGroup id="close" label={copy.close.label}>
          <CloseAccount returnTo={settingsPaths.index} freshForMs={fresh} />
        </SettingsGroup>
        <SettingsGroup id="sign-out" label={copy.signOut.label}>
          <p className={styles.help}>{copy.signOut.help}</p>
          <SignOutForm />
        </SettingsGroup>
      </div>
    </section>
  );
}
