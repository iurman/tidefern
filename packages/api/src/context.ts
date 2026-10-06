import type { RequestActor } from "./actor";

export type Defer = (task: () => Promise<void>) => void;

/**
 * The facts of the signed-in session that route code may read. `createdAt`
 * is the authentication instant: Better Auth 1.7.7 creates a new session
 * row on every sign-in (password, passkey or the TOTP step that completes
 * one) and exposes no separate re-authentication timestamp, so the fresh
 * authentication rule of architecture 6.1 is measured from it. The token is
 * deliberately absent; nothing downstream needs it.
 */
export interface SessionFacts {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface ApiVariables {
  defer: Defer;
  /** Null for an anonymous request. */
  session: SessionFacts | null;
  /** Null for an anonymous request; what `can()` consumes otherwise. */
  actor: RequestActor | null;
}

/** The Hono environment every middleware and handler in this package is typed against. */
export type ApiEnv = { Variables: ApiVariables };
