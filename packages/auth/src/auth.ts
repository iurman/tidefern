import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { twoFactor } from "better-auth/plugins";

import { EnvKeyProvider } from "@tidefern/crypto";
// This package and withActor()/withSystem() inside packages/db are the only
// importers of the raw client: Better Auth owns its tables and reads them as
// the connection's own role. Importing it builds a pg Pool; nothing connects
// until the first query.
import { db as productionDb } from "@tidefern/db/client";
import * as productionSchema from "@tidefern/db/schema";

import { hostFactsFromEnvironment, resolveHosts } from "./hosts";
import type { HostFacts } from "./hosts";
import { userKeyDatabaseHooks } from "./keys";
import { chooseMailer } from "./mail/choose";
import { passwordResetEmail, verificationEmail } from "./mail/templates";
import { ConsoleMailer } from "./mailer";
import type { Mailer } from "./mailer";

const DAY = 60 * 60 * 24;

export interface CreateAuthOptions {
  /** A drizzle database; the pooled production client by default. */
  database?: object | undefined;
  /** The drizzle schema the adapter maps models onto; the db package's by default. */
  schema?: Record<string, unknown> | undefined;
  /** Where verification and reset mail goes; stdout by default. */
  mailer?: Mailer | undefined;
  /** Production host, team slug and the Vercel facts; never read from the environment here. */
  hosts: HostFacts;
  /** Signs sessions and tokens. Better Auth refuses to run in production without one. */
  secret?: string | undefined;
  /**
   * Lifecycle hooks on the identity tables. The module-scope instance passes
   * `userKeyDatabaseHooks()` so every new user gets a wrapped DEK (task D2);
   * tests pass the same factory with a fixed provider, or nothing.
   */
  databaseHooks?: BetterAuthOptions["databaseHooks"] | undefined;
}

/**
 * The Better Auth server, configured exactly as architecture section 6.1.
 * Everything that varies by environment arrives through `options`, so a test
 * builds one with fixed facts and an in-memory mailer.
 */
export function createAuth(options: CreateAuthOptions) {
  const hosts = resolveHosts(options.hosts);
  const mailer = options.mailer ?? new ConsoleMailer();

  return betterAuth({
    appName: "Tidefern",
    ...(options.secret !== undefined ? { secret: options.secret } : {}),
    ...(options.databaseHooks !== undefined ? { databaseHooks: options.databaseHooks } : {}),

    // Multi-host form: each preview answers on its own host, production stays
    // fixed, and anything else falls back to production. The trusted origins
    // carry the same two patterns and nothing wider.
    baseURL: hosts.baseURL,
    basePath: "/api/auth",
    trustedOrigins: hosts.trustedOrigins,

    database: drizzleAdapter(options.database ?? productionDb, {
      provider: "pg",
      schema: options.schema ?? productionSchema,
    }),

    emailAndPassword: {
      enabled: true,
      // Also prevents account enumeration on sign-up.
      requireEmailVerification: true,
      // Off by default in Better Auth; a reset must end every other session.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await mailer.send({ to: user.email, ...passwordResetEmail(url) });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send({ to: user.email, ...verificationEmail(url) });
      },
    },

    session: {
      expiresIn: 7 * DAY,
      updateAge: DAY,
      // Off until its interaction with two-factor sign-in is re-verified (an
      // April 2026 advisory involved cached sessions); revocation stays immediate.
      cookieCache: { enabled: false },
    },

    // Memory storage is per instance and useless on Fluid compute. The
    // built-in special rules stay: sign-in, sign-up and credential changes
    // are 3 requests per 10 seconds, reset and verification mail 3 per minute.
    rateLimit: { enabled: true, storage: "database" },

    telemetry: { enabled: false },

    advanced: {
      database: { generateId: "uuid" },
      // The production default, written down because Better Auth skips the
      // origin check whenever NODE_ENV is "test"; the unit tests prove the
      // narrow trusted origins reject a foreign host only if it stays on.
      disableOriginCheck: false,
    },

    plugins: [
      // TOTP with single-use backup codes (the plugin's defaults: ten codes).
      // No client ever sends `trustDevice`: a 30-day remembered device on a
      // shared household computer would defeat the second factor
      // (architecture 6.1). Passkeys are the convenient path instead.
      twoFactor({ issuer: "Tidefern" }),
      passkey({ rpID: hosts.rpID, rpName: "Tidefern", origin: hosts.passkeyOrigin }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];

/**
 * The transport this module copy sends mail through, chosen once from the
 * environment. The host hands the same instance to the API for the mail it
 * sends itself (the sharing invitation). A Next.js production build loads
 * this module once per runtime, so a process can hold two copies; under
 * capture they share one process-wide store (`./mail/capture.ts`), so the
 * E2E endpoint reads every copy's messages.
 */
export const mailer: Mailer = chooseMailer(process.env);

/**
 * The instance the Hono app mounts (task C2). This is the one place the
 * package reads the environment: BETTER_AUTH_SECRET, BETTER_AUTH_URL, the
 * Vercel variables, and the mail facts `chooseMailer()` picks the transport
 * from (Resend on production, capture under E2E_MAIL_CAPTURE, the console
 * otherwise). The key provider reads TIDEFERN_KEK_V1 on the first sign-up,
 * not here, so a build without it still starts.
 */
export const auth: Auth = createAuth({
  hosts: hostFactsFromEnvironment(process.env),
  mailer,
  secret: process.env.BETTER_AUTH_SECRET,
  databaseHooks: userKeyDatabaseHooks({ provider: new EnvKeyProvider() }),
});

export { createUserKeyHook, userKeyDatabaseHooks } from "./keys";
export type { DatabaseHooks, UserCreatedHook, UserKeyHookOptions } from "./keys";
