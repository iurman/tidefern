import { NextResponse } from "next/server";
import { POST as api } from "@/app/api/[[...route]]/route";

/**
 * Signing out is a POST and only a POST: a link that signs someone out on a
 * GET can be triggered by an image tag or a prefetch. Next answers GET with
 * 405 because only POST is exported here. The handler forwards the request
 * in process to Better Auth's own sign-out under /api/auth (one function
 * invocation, no second hop), copies the cookie it clears onto the
 * redirect, and sends the person home. When the auth server did not answer
 * 2xx the session still exists, so the redirect goes back to /today rather
 * than pretending.
 *
 * The redirect's Location is a path, not an absolute URL: `request.url`
 * carries the server's own listen name (localhost on Vercel and behind any
 * proxy), so an absolute Location built from it would send the visitor off
 * the origin they came from. A browser resolves a path against the request's
 * own origin, which is always the right one.
 */
export const dynamic = "force-dynamic";

const FORWARDED = ["cookie", "origin", "referer", "host", "x-forwarded-host", "x-forwarded-proto"];

export async function POST(request: Request) {
  const headers = new Headers({ "content-type": "application/json" });
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  let signedOut = false;
  let cookies: string[] = [];
  try {
    const response = await api(
      new Request(new URL("/api/auth/sign-out", request.url), {
        method: "POST",
        headers,
        body: "{}",
      }),
    );
    signedOut = response.ok;
    cookies = response.headers.getSetCookie();
  } catch {
    signedOut = false;
  }
  const redirect = new NextResponse(null, {
    status: 303,
    headers: {
      location: signedOut ? "/" : "/today",
      "cache-control": "private, no-store",
    },
  });
  for (const cookie of cookies) redirect.headers.append("set-cookie", cookie);
  return redirect;
}
