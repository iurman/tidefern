/**
 * The pure reading of an `otpauth://totp/...` URI, the one thing Better
 * Auth's enable call returns that a person may need to type by hand when a
 * camera is not at hand. No React, no network, so the unit tests cover it.
 */

export interface TotpFacts {
  /** The shared secret, base32, exactly as the URI carries it. */
  secret: string;
  /** The secret in groups of four for reading aloud or typing. */
  secretGrouped: string;
  issuer: string | null;
  /** The account label after the issuer prefix, usually the email. */
  account: string | null;
}

/** Splits a base32 secret into groups of four so it can be read and typed without losing the place. */
export function groupSecret(secret: string): string {
  return (
    secret
      .replace(/\s+/g, "")
      .match(/.{1,4}/g)
      ?.join(" ") ?? ""
  );
}

/**
 * Reads the secret, issuer and account from an otpauth URI. A URI that is
 * not `otpauth://totp/` or carries no secret answers null; the page then
 * shows the link alone rather than an empty key.
 */
export function readTotpUri(uri: string): TotpFacts | null {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return null;
  }
  if (parsed.protocol !== "otpauth:" || parsed.hostname.toLowerCase() !== "totp") return null;
  const secret = parsed.searchParams.get("secret")?.trim() ?? "";
  if (secret.length === 0) return null;
  const label = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  const colon = label.indexOf(":");
  const labelIssuer = colon >= 0 ? label.slice(0, colon).trim() : "";
  const account = (colon >= 0 ? label.slice(colon + 1) : label).trim();
  const issuer = parsed.searchParams.get("issuer")?.trim() || labelIssuer || null;
  return {
    secret,
    secretGrouped: groupSecret(secret),
    issuer,
    account: account.length > 0 ? account : null,
  };
}
