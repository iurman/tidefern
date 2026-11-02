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
import { GroupScreen, Help } from "./settings-frame";
import { ThemeControl } from "./theme-control";

/**
 * Each settings group on a screen of its own (DESIGN.md 3.8: on phones every
 * row of the index opens one, with a link back to Settings). The same
 * groups as the stacked index, reading only what each needs. `me` is null
 * when the session read failed; the group then says its read failed.
 */

async function profileFor(me: Me | null) {
  return me === null ? null : readProfile(await settingsClient());
}

export async function ProfileScreen({ me }: { me: Me | null }) {
  return (
    <GroupScreen id="profile" title={copy.profile.label}>
      <ProfileProvider initial={await profileFor(me)}>
        <ProfileForm />
      </ProfileProvider>
    </GroupScreen>
  );
}

export async function TimeZoneScreen({ me }: { me: Me | null }) {
  const now = new Date(serverNow()).toISOString();
  return (
    <GroupScreen id="time-zone" title={copy.timeZone.label}>
      <ProfileProvider initial={await profileFor(me)}>
        <TimeZoneForm now={now} />
      </ProfileProvider>
    </GroupScreen>
  );
}

export async function UnitsScreen({ me }: { me: Me | null }) {
  return (
    <GroupScreen id="units" title={copy.units.label}>
      <ProfileProvider initial={await profileFor(me)}>
        <UnitsControl />
      </ProfileProvider>
    </GroupScreen>
  );
}

export function ThemeScreen() {
  return (
    <GroupScreen id="theme" title={copy.theme.label}>
      <ThemeControl />
    </GroupScreen>
  );
}

export async function NotificationsScreen({ me }: { me: Me | null }) {
  return (
    <GroupScreen id="notifications" title={copy.notifications.label}>
      <ProfileProvider initial={await profileFor(me)}>
        <NotificationsControl />
      </ProfileProvider>
    </GroupScreen>
  );
}

export function ExportScreen({ me }: { me: Me | null }) {
  return (
    <GroupScreen id="export" title={copy.export.label}>
      <Help>{copy.export.help}</Help>
      <ExportControl
        returnTo={settingsPaths.export}
        freshForMs={freshForMs(me?.session.authenticatedAt, serverNow())}
      />
    </GroupScreen>
  );
}

export async function ConsentScreen({ me }: { me: Me | null }) {
  const client = me === null ? null : await settingsClient();
  const [consents, processors] =
    client === null
      ? [null, null]
      : await Promise.all([readConsents(client), readProcessors(client)]);
  const needsNames = consents?.some((consent) => consent.consentingGuardianId !== null) ?? false;
  const childNames =
    client !== null && needsNames ? await readChildNames(client) : new Map<string, string>();
  const timeZone = me?.profile?.timeZone;
  const view =
    me !== null && consents !== null && timeZone !== undefined
      ? consentView(consents, me.id, timeZone, childNames)
      : null;
  return (
    <GroupScreen id="consent" title={copy.consent.label}>
      <ConsentSection
        view={view}
        processors={processors}
        returnTo={settingsPaths.consent}
        freshForMs={freshForMs(me?.session.authenticatedAt, serverNow())}
        headingLevel={2}
      />
    </GroupScreen>
  );
}

export function CloseAccountScreen({ me }: { me: Me | null }) {
  return (
    <GroupScreen id="close" title={copy.close.label}>
      <CloseAccount
        returnTo={settingsPaths.close}
        freshForMs={freshForMs(me?.session.authenticatedAt, serverNow())}
      />
    </GroupScreen>
  );
}
