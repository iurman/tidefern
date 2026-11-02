import { settingsCopy, settingsPaths } from "@/components/pages/settings/copy";
import { BackLink } from "@/components/ui/back-link";
import { TextLink } from "@/components/ui/text-link";
import { pageMetadata } from "@/lib/site";
import { soundCopy as copy } from "./copy";
import { SoundLevelControl } from "./level-control";
import { QuietHoursControl } from "./quiet-hours-control";
import { SampleButton } from "./sample-button";
import styles from "./sound.module.css";

export const metadata = pageMetadata("/settings/sound", copy.title, copy.description, false);

/**
 * The sound settings (architecture 14.1 and 14.2): the three-level control,
 * quiet hours, and a sample. The server renders the heading and the frame;
 * the controls are the client's, because the choices live on the device
 * (`tidefern-sound-v1`, `tidefern-quiet-hours-v1`) until task E2 carries
 * them on the profile. Nothing here is a health fact.
 */
export default function SoundSettingsPage() {
  return (
    <section className={styles.page} aria-labelledby="sound-title">
      <BackLink href={settingsPaths.index}>{settingsCopy.back}</BackLink>
      <h1 id="sound-title" className={styles.heading}>
        {copy.heading}
      </h1>
      <p className={styles.lede}>{copy.lede}</p>

      <div className={styles.group}>
        <SoundLevelControl />
        <p className={styles.help}>{copy.level.help}</p>
      </div>

      <h2 className={styles.subheading}>{copy.quiet.heading}</h2>
      <QuietHoursControl />

      <h2 className={styles.subheading}>{copy.sample.heading}</h2>
      <SampleButton />

      <p className={styles.related}>
        <TextLink href="/settings/devices">{copy.related}</TextLink>
      </p>
    </section>
  );
}
