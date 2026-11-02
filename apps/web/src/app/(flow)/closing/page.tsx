import { redirect } from "next/navigation";
import { DropInvitationFragment } from "@/components/drop-invitation-fragment";
import { ClosingView } from "@/components/pages/settings/closing-view";
import { closureView } from "@/components/pages/settings/closure";
import { settingsCopy, settingsPaths } from "@/components/pages/settings/copy";
import { readClosure, serverNow, settingsClient } from "@/components/pages/settings/server-data";
import styles from "@/components/pages/settings/closing.module.css";
import { sessionMe } from "@/lib/api-server";
import { SIGN_IN_PATH } from "@/lib/auth-client";
import { pageMetadata } from "@/lib/site";

const copy = settingsCopy.closing;

// A neutral title: nothing about the closure in it.
export const metadata = pageMetadata("/closing", copy.title, copy.description, false);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * The locked view (task H7 on G10's route). The (app) layout sends a person
 * whose account is closing here, because the API refuses her everywhere but
 * the closure, the export and the consents; anyone else belongs in
 * Settings. The session read is the layout's (`sessionMe` shares one answer
 * per request), and the layout carries the sign-out form. The closure
 * itself is read from GET /v1/me/close and said as days left, the undo
 * while its window is open, and the export (closing-view.tsx).
 *
 * An invitation link opened by a closing account arrives here with its
 * `#invitation=` fragment, which nothing here can accept, so the page takes
 * it out of the address bar and forgets it.
 */
export default async function ClosingPage() {
  const lookup = await sessionMe();
  if (lookup.kind === "anonymous") redirect(SIGN_IN_PATH);
  if (lookup.kind === "ok") redirect(settingsPaths.index);
  if (lookup.kind === "failed") {
    return (
      <section className={styles.view} aria-labelledby="closing-title">
        <h1 id="closing-title" className={styles.heading}>
          {copy.heading.plain}
        </h1>
        <p className={styles.lede}>{copy.readFailed}</p>
        <DropInvitationFragment />
      </section>
    );
  }
  const closure = await readClosure(await settingsClient());
  return (
    <>
      {closure.ok ? (
        <ClosingView view={closureView(closure.request, serverNow())} />
      ) : (
        <section className={styles.view} aria-labelledby="closing-title">
          <h1 id="closing-title" className={styles.heading}>
            {copy.heading.plain}
          </h1>
          <p className={styles.lede}>{copy.readFailed}</p>
        </section>
      )}
      <DropInvitationFragment />
    </>
  );
}
