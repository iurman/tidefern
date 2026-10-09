// The seeded personas the perf scripts sign in as (lighthouse.mjs and bytes.mjs).
//
// The synthetic seed cast (packages/db README, "The cast"); these accounts exist only in a
// database seeded by `pnpm db:seed`, never in production.
export const personas = {
  noor: { email: "noor@example.test", password: "tidefern-seed-noor" },
  mira: { email: "mira@example.test", password: "tidefern-seed-mira" },
  pia: { email: "pia@example.test", password: "tidefern-seed-pia" },
};

/** Signs a persona in through the API and returns the Cookie header value. */
export async function signIn(origin, name) {
  const persona = personas[name];
  if (!persona) throw new Error(`no seeded persona called ${name}`);
  const response = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: persona.email, password: persona.password }),
  });
  if (!response.ok) {
    throw new Error(`sign-in as ${name} answered ${response.status}`);
  }
  const cookies = response.headers.getSetCookie().map((line) => line.split(";")[0]);
  if (!cookies.length) throw new Error(`sign-in as ${name} set no cookie`);
  return cookies.join("; ");
}
