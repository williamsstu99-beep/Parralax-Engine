import { afterEach, describe, expect, it } from "vitest";
import { accessToken, hasAccess } from "./access";
import { safeNext } from "./safe-next";

afterEach(() => { delete process.env.ACCESS_CODE; });

describe("access gate", () => {
  it("accepts the cookie for the current code and rejects anything else", async () => {
    const token = await accessToken();
    expect(await hasAccess(token)).toBe(true);
    expect(await hasAccess(undefined)).toBe(false);
    expect(await hasAccess("4145")).toBe(false);
  });

  it("changing ACCESS_CODE locks out existing cookies", async () => {
    const old = await accessToken();
    process.env.ACCESS_CODE = "9999";
    expect(await hasAccess(old)).toBe(false);
    expect(await hasAccess(await accessToken())).toBe(true);
  });

  it("only redirects to paths on this site", () => {
    expect(safeNext("/lesson?x=1")).toBe("/lesson?x=1");
    expect(safeNext(null)).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
  });
});
