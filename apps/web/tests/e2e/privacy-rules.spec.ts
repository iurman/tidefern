import { expect, test } from "@playwright/test";
import {
  API_CSP,
  HSTS,
  apiProblems,
  baseHeaderProblems,
  cspProblems,
  htmlProblems,
  isPrivateNoStore,
  isThirdParty,
  titleProblems,
  urlProblems,
} from "./privacy-rules";

/**
 * The privacy walk's rules (./privacy-rules.ts) against fixed inputs, with
 * no server: each one accepts what the site sends today and rejects the
 * regressions it exists to catch. Nothing here is tagged @smoke.
 */

const origin = "http://127.0.0.1:3272";

const base = {
  "strict-transport-security": HSTS,
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
};

const policy =
  "default-src 'self'; script-src 'self' 'nonce-ZjIxNjQ3NjQ=' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests";

const html = {
  ...base,
  "content-security-policy": policy,
  "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
  "x-robots-tag": "noindex, nofollow",
};

test("a request is third-party only when it leaves the origin over the network", () => {
  expect(isThirdParty(`${origin}/today`, origin)).toBe(false);
  expect(isThirdParty("data:image/png;base64,AAAA", origin)).toBe(false);
  expect(isThirdParty(`blob:${origin}/1234`, origin)).toBe(false);
  expect(isThirdParty("https://fonts.googleapis.com/css2", origin)).toBe(true);
  expect(isThirdParty("http://127.0.0.1:3000/today", origin), "another port").toBe(true);
  expect(isThirdParty("not a url", origin)).toBe(true);
});

test("the base headers: each missing or weakened one is named", () => {
  expect(baseHeaderProblems(base)).toEqual([]);
  expect(baseHeaderProblems({ ...base, "strict-transport-security": "max-age=0" })).toHaveLength(1);
  expect(baseHeaderProblems({ ...base, "x-content-type-options": "" })).toHaveLength(1);
  expect(baseHeaderProblems({ ...base, "referrer-policy": "unsafe-url" })).toHaveLength(1);
  expect(baseHeaderProblems({ ...base, "x-frame-options": "SAMEORIGIN" })).toHaveLength(1);
  expect(baseHeaderProblems({ ...base, "permissions-policy": "camera=()" })).toEqual([
    "Permissions-Policy lacks microphone=()",
    "Permissions-Policy lacks geolocation=()",
  ]);
});

test("the page policy: a nonce and strict-dynamic, never unsafe-inline or another origin", () => {
  expect(cspProblems(policy)).toEqual([]);
  expect(cspProblems(undefined)).toEqual(["no Content-Security-Policy"]);
  expect(cspProblems(policy.replace("'nonce-ZjIxNjQ3NjQ=' ", ""))).toContain(
    "script-src has no nonce",
  );
  expect(cspProblems(policy.replace("'strict-dynamic'", "'unsafe-inline'"))).toEqual([
    "script-src lacks 'strict-dynamic'",
    "script-src allows 'unsafe-inline'",
  ]);
  expect(cspProblems(policy.replace("frame-ancestors 'none'", "frame-ancestors 'self'"))).toEqual([
    "frame-ancestors is \"'self'\", not 'none'",
  ]);
  expect(
    cspProblems(policy.replace("connect-src 'self'", "connect-src 'self' https://r2.example.com")),
  ).toEqual(["connect-src allows another origin (https://r2.example.com)"]);
  expect(cspProblems(policy.replace("img-src 'self'", "img-src 'self' cdn.example.com"))).toEqual([
    "img-src allows another origin (cdn.example.com)",
  ]);
  expect(cspProblems(policy.replace("img-src 'self'", "img-src *"))).toEqual([
    "img-src allows another origin (*)",
  ]);
});

test("private and no-store, never public", () => {
  expect(isPrivateNoStore("private, no-store")).toBe(true);
  expect(isPrivateNoStore("private, no-cache, no-store, max-age=0, must-revalidate")).toBe(true);
  expect(isPrivateNoStore("no-store")).toBe(false);
  expect(isPrivateNoStore("private, max-age=60")).toBe(false);
  expect(isPrivateNoStore("public, private, no-store")).toBe(false);
  expect(isPrivateNoStore(undefined)).toBe(false);
});

test("an HTML page: the policy, never stored, and noindex unless production is indexable", () => {
  expect(htmlProblems(html)).toEqual([]);
  expect(htmlProblems({ ...html, "cache-control": "public, max-age=0, must-revalidate" })).toEqual([
    'Cache-Control is "public, max-age=0, must-revalidate", not private and no-store',
  ]);
  const indexed = { ...html, "x-robots-tag": "" };
  expect(htmlProblems(indexed)).toEqual(['X-Robots-Tag is "", not noindex']);
  expect(htmlProblems(indexed, { indexable: true })).toEqual([]);
});

test("an API answer: exactly private, no-store and the API's own policy", () => {
  const answer = {
    ...base,
    "cache-control": "private, no-store",
    "content-security-policy": API_CSP,
  };
  expect(apiProblems(answer)).toEqual([]);
  expect(apiProblems({ ...answer, "cache-control": "private, no-cache, no-store" })).toHaveLength(
    1,
  );
  expect(apiProblems({ ...answer, "content-security-policy": policy })).toHaveLength(1);
});

test("health data in a URL: a page path or any query beyond the neutral set", () => {
  expect(urlProblems(`${origin}/today`, { checkPath: true })).toEqual([]);
  expect(urlProblems(`${origin}/log/2026-10-04`, { checkPath: true })).toEqual([]);
  expect(urlProblems(`${origin}/calendar?_rsc=abc`, { checkPath: true })).toEqual([]);
  expect(urlProblems(`${origin}/sign-in?next=%2Fsettings`, { checkPath: true })).toEqual([]);
  expect(urlProblems(`${origin}/pregnancy`, { checkPath: true })).toEqual([
    "the path /pregnancy names a health fact",
  ]);
  // API resource names are a published contract and are logged as templates; their queries are not.
  expect(urlProblems(`${origin}/api/v1/pregnancies/current`, { checkPath: false })).toEqual([]);
  expect(urlProblems(`${origin}/api/v1/cycle/entries?flow=heavy`, { checkPath: false })).toEqual([
    'query parameter "flow" on /api/v1/cycle/entries',
  ]);
  expect(urlProblems(`${origin}/today?next=period`, { checkPath: true })).toEqual([
    'query value of "next" names a health fact',
  ]);
});

test("health data in a title", () => {
  for (const title of ["Today | Tidefern", "Calendar | Tidefern", "Settings | Tidefern"])
    expect(titleProblems(title), title).toEqual([]);
  for (const title of ["Period day 2 | Tidefern", "Week 12 | Tidefern", "Pregnancy | Tidefern"])
    expect(titleProblems(title), title).toHaveLength(1);
});
