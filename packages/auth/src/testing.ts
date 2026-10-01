import { TEST_PEOPLE, type TestPersonKey, totpCode } from "./test-people.js";

export interface SignedIn {
  /** `Cookie` header value for later requests. */
  cookie: string;
}

const cookieHeader = (response: Response, previous = "") => {
  const jar = new Map(
    previous
      .split("; ")
      .filter(Boolean)
      .map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)] as const),
  );
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const name = pair!.slice(0, pair!.indexOf("="));
    const value = pair!.slice(pair!.indexOf("=") + 1);
    if (/max-age=0/i.test(line) || value === "") jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
};

/**
 * Signs in as any test person through the real sign-in routes, including the
 * authenticator step for staff with MFA (TECH-03 §3). `authUrl` is where the
 * sign-in routes are served (the API's /v1/auth, or the web app's
 * /api/v1/auth), and `origin` is the trusted web origin.
 */
export async function signInAs(
  key: TestPersonKey,
  options: { authUrl: string; origin: string; fetch?: typeof fetch; headers?: Record<string, string> },
): Promise<SignedIn> {
  const person = TEST_PEOPLE[key];
  const doFetch = options.fetch ?? fetch;
  const post = (path: string, body: unknown, cookie = "") =>
    doFetch(`${options.authUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: options.origin, ...options.headers, ...(cookie && { cookie }) },
      body: JSON.stringify(body),
    });

  const signIn = await post("/sign-in/email", { email: person.email, password: person.password });
  if (!signIn.ok) throw new Error(`Test sign-in failed for ${key}: ${signIn.status} ${await signIn.text()}`);
  let cookie = cookieHeader(signIn);
  const body = (await signIn.json()) as { twoFactorRedirect?: boolean };

  if (body.twoFactorRedirect) {
    if (!("totpSecret" in person)) throw new Error(`${key} has no authenticator secret`);
    const verify = await post("/two-factor/verify-totp", { code: await totpCode(person.totpSecret) }, cookie);
    if (!verify.ok) throw new Error(`Test MFA failed for ${key}: ${verify.status} ${await verify.text()}`);
    cookie = cookieHeader(verify, cookie);
  }
  return { cookie };
}
