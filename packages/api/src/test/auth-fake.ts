import type { SessionAuth, SessionLookup } from "../auth";

/**
 * The cookie name the fake reads. Over https Better Auth prefixes it with
 * `__Secure-`; the API never parses the cookie itself (the headers go to
 * `getSession` whole), so nothing in the API depends on this name and no
 * test may assert it.
 */
export const SESSION_COOKIE = "better-auth.session_token";

/**
 * A Better Auth stand-in for the API tests: sessions are handed in by
 * token, `getSession` reads the same cookie name the real client sends,
 * and `handler` records what reached it and answers with the path so a
 * test can prove the mount forwards the raw request. No signing, no
 * database: those are the auth package's own tests.
 */
export class FakeAuth implements SessionAuth {
  readonly sessions = new Map<string, SessionLookup>();
  readonly handled: string[] = [];
  lookups = 0;

  readonly api = {
    getSession: async ({ headers }: { headers: Headers }): Promise<SessionLookup | null> => {
      this.lookups += 1;
      const token = cookieValue(headers.get("cookie"), SESSION_COOKIE);
      return token === undefined ? null : (this.sessions.get(token) ?? null);
    },
  };

  async handler(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    this.handled.push(path);
    return Response.json({ handledBy: "better-auth", path }, { status: 200 });
  }

  /** Registers a session for `token`, created `ageSeconds` ago and valid for seven days. */
  signIn(token: string, userId: string, email: string, ageSeconds = 0): void {
    const createdAt = new Date(Date.now() - ageSeconds * 1000);
    this.sessions.set(token, {
      session: {
        id: `session-${token}`,
        userId,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
      user: { id: userId, email, emailVerified: true },
    });
  }
}

/** Request headers that carry the session cookie for `token`. */
export function sessionHeaders(token: string): HeadersInit {
  return { cookie: `${SESSION_COOKIE}=${token}` };
}

function cookieValue(header: string | null, name: string): string | undefined {
  if (header === null) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}
