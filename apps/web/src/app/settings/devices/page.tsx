import { TextLink } from "@/components/ui/text-link";
import { pageMetadata } from "@/lib/site";
import { devicesCopy as copy } from "./copy";
import { DevicesList } from "./devices-list";
import styles from "./devices.module.css";

export const metadata = pageMetadata("/settings/devices", copy.title, copy.description, false);

/**
 * The devices screen (architecture 6.1 and DESIGN.md 3.8). The server renders
 * the heading and the frame; the list itself is read by the client from
 * Better Auth, because the session routes answer the browser's own cookie
 * and nothing about a device is a health fact.
 */
export default function DevicesPage() {
  return (
    <section className={styles.page} aria-labelledby="devices-title">
      <h1 id="devices-title" className={styles.heading}>
        {copy.heading}
      </h1>
      <p className={styles.lede}>{copy.lede}</p>
      <DevicesList />
      <p className={styles.related}>
        <TextLink href="/settings/two-factor">{copy.twoFactorLink}</TextLink>
      </p>
    </section>
  );
}
