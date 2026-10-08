import { settingsCopy as copy, settingsPaths } from "@/components/pages/settings/copy";
import { ConsentScreen } from "@/components/pages/settings/settings-screens";
import { settingsSession } from "@/components/pages/settings/settings-session";
import { sessionMe } from "@/lib/api-server";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  settingsPaths.consent,
  copy.consent.label,
  copy.consent.description,
  false,
);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * The consent record group on its own screen, with the way back to Settings (DESIGN.md 3.8:
 * each row of the phone index opens one). The session read is the (app)
 * layout's; a visitor it is sending elsewhere gets nothing rendered here.
 */
export default async function ConsentSettingsPage() {
  const session = settingsSession(await sessionMe());
  if (session.kind === "leave") return null;
  return <ConsentScreen me={session.kind === "ok" ? session.me : null} />;
}
