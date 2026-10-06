"use client";
import { useMemo } from "react";
import { encode } from "uqr";
import { matrixPath, matrixSize } from "./qr";
import styles from "./two-factor.module.css";

export interface QrCodeProps {
  /** The text the code carries, here the otpauth URI. */
  value: string;
  /** What the image is, for assistive technology; the text itself is never read out. */
  label: string;
}

/**
 * The otpauth URI as a QR code, drawn in the browser from the secret the
 * server just returned and never sent anywhere else. It is an image, so it
 * keeps dark modules on a light tile in both themes (a scanner expects
 * that, and an image is never inverted); both colors are palette tokens.
 * Error correction M survives a smudged phone screen; the two-module quiet
 * zone is the minimum scanners rely on.
 */
export function QrCode({ value, label }: QrCodeProps) {
  const matrix = useMemo(() => encode(value, { ecc: "M", border: 2 }).data, [value]);
  const size = matrixSize(matrix);
  return (
    <svg
      className={styles.qr}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      data-modules={size}
    >
      <rect width={size} height={size} className={styles.qrTile} />
      <path d={matrixPath(matrix)} className={styles.qrModules} />
    </svg>
  );
}
