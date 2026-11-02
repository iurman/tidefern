import { settingsCopy as copy, settingsPaths } from "@/components/pages/settings/copy";
import { ProfileScreen } from "@/components/pages/settings/settings-screens";
import { settingsSession } from "@/components/pages/settings/settings-session";
import { sessionMe } from "@/lib/api-server";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  settingsPaths.profile,
  copy.profile.label,
  copy.profile.description,
  false,
);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * The profile group on its own screen, with the way back to Settings (DESIGN.md 3.8:
 * each row of the phone index opens one). The session read is the (app)
 * layout's; a visitor it is sending elsewhere gets nothing rendered here.
 */
export default async function ProfileSettingsPage() {
  const session = settingsSession(await sessionMe());
  if (session.kind === "leave") return null;
  return <ProfileScreen me={session.kind === "ok" ? session.me : null} />;
}
