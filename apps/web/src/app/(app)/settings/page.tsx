import { settingsCopy as copy } from "@/components/pages/settings/copy";
import { SettingsIndex } from "@/components/pages/settings/settings-index";
import { settingsSession } from "@/components/pages/settings/settings-session";
import { sessionMe } from "@/lib/api-server";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("/settings", copy.title, copy.description, false);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * Settings (task H7, DESIGN.md 3.8). The session read is the (app)
 * layout's (`sessionMe` shares one answer per request); a visitor the
 * layout is sending elsewhere gets nothing rendered here.
 */
export default async function SettingsPage() {
  const session = settingsSession(await sessionMe());
  if (session.kind === "leave") return null;
  return <SettingsIndex me={session.kind === "ok" ? session.me : null} />;
}
