/**
 * The "enter code" gate. One shared code (ACCESS_CODE, default 4145) unlocks the
 * site; the browser then keeps a cookie holding a hash of that code. Changing
 * ACCESS_CODE invalidates every existing cookie, so it doubles as "lock everyone out".
 */
export const ACCESS_COOKIE = "dl_access";
export const ACCESS_MAX_AGE = 60 * 60 * 24 * 365; // a year

export const accessCode = () => (process.env.ACCESS_CODE ?? "4145").trim();

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value that proves someone entered the current code. */
export const accessToken = () => sha256(`dynamic-learning-access:${accessCode()}`);

export async function hasAccess(cookieValue: string | undefined): Promise<boolean> {
  return !!cookieValue && cookieValue === (await accessToken());
}
