import { describe, expect, it } from "vitest";
import { groupSecret, readTotpUri } from "./totp-uri";

const uri =
  "otpauth://totp/Tidefern:person%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Tidefern&period=30&digits=6";

describe("readTotpUri", () => {
  it("reads the secret, issuer and account from the URI Better Auth returns", () => {
    expect(readTotpUri(uri)).toEqual({
      secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
      secretGrouped: "JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP",
      issuer: "Tidefern",
      account: "person@example.com",
    });
  });

  it("takes the issuer from the label when the query has none", () => {
    expect(readTotpUri("otpauth://totp/Tidefern:sam?secret=ABCD")).toMatchObject({
      issuer: "Tidefern",
      account: "sam",
    });
    expect(readTotpUri("otpauth://totp/sam?secret=ABCD")).toMatchObject({
      issuer: null,
      account: "sam",
    });
  });

  it("answers null for anything that is not a TOTP URI with a secret", () => {
    expect(readTotpUri("otpauth://hotp/Tidefern:sam?secret=ABCD")).toBeNull();
    expect(readTotpUri("otpauth://totp/Tidefern:sam?issuer=Tidefern")).toBeNull();
    expect(readTotpUri("https://example.com/?secret=ABCD")).toBeNull();
    expect(readTotpUri("not a uri")).toBeNull();
    expect(readTotpUri("")).toBeNull();
  });
});

describe("groupSecret", () => {
  it("groups by four and keeps a short tail", () => {
    expect(groupSecret("ABCDEFGHIJ")).toBe("ABCD EFGH IJ");
    expect(groupSecret("AB CD EF")).toBe("ABCD EF");
    expect(groupSecret("")).toBe("");
  });
});
