import type { NotificationDetail } from "@tidefern/schemas";
import { Mark } from "@/components/logo";
import { settingsCopy } from "./copy";
import styles from "./settings.module.css";

/**
 * How a reminder would look on a lock screen at each detail level
 * (architecture 10.3), drawn from the tokens in both themes. The text is the
 * product's sample, never anything of the person's: the generic line is the
 * one every reminder email carries, and the gentle and detailed wording is
 * the owner's to write (docs/design/CONTENT.md, `/settings`), so it shows as
 * a marked placeholder until then. The clock is decoration.
 */
export function LockScreenPreview({ detail }: { detail: NotificationDetail }) {
  const preview = settingsCopy.notifications.preview;
  return (
    <figure className={styles.preview} data-detail={detail}>
      <div className={styles.lockScreen}>
        <p className={styles.clock} aria-hidden="true">
          {preview.clock}
        </p>
        <div className={styles.notice}>
          <p className={styles.noticeHead}>
            <Mark size={20} />
            <span className={styles.noticeApp}>{preview.app}</span>
            <span className={styles.noticeWhen}>{preview.when}</span>
          </p>
          <p className={styles.noticeBody} aria-live="polite">
            {preview.body[detail]}
          </p>
        </div>
      </div>
      <figcaption className={styles.caption}>{preview.caption}</figcaption>
    </figure>
  );
}
