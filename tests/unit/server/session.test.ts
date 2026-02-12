import { describe, expect, it } from "vitest";

import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  createSessionCookie,
  createSessionToken,
  getSessionExpiresAt,
  getSessionTokenFromRequest,
  hashSessionToken,
} from "../../../apps/web/src/server/auth/session.ts";

describe("server/auth/session", () => {
  it("creates random session tokens", () => {
    const tokenA = createSessionToken();
    const tokenB = createSessionToken();

    expect(tokenA).toHaveLength(32);
    expect(tokenB).toHaveLength(32);
    expect(tokenA).not.toBe(tokenB);
  });

  it("hashes tokens deterministically", () => {
    const hashA = hashSessionToken("abc");
    const hashB = hashSessionToken("abc");

    expect(hashA).toBe(hashB);
    expect(hashA).toHaveLength(64);
  });

  it("adds session TTL days", () => {
    const expiresAt = getSessionExpiresAt(new Date("2026-02-01T00:00:00.000Z"));

    expect(expiresAt.toISOString()).toBe("2026-03-03T00:00:00.000Z");
  });

  it("serializes and clears cookies", () => {
    const cookie = createSessionCookie("token", new Date("2026-03-01T00:00:00.000Z"));
    const cleared = clearSessionCookie();

    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=token`);
    expect(cookie).toContain("HttpOnly");
    expect(cleared).toContain(`${SESSION_COOKIE_NAME}=`);
  });

  it("extracts session token from request cookies", () => {
    const request = new Request("http://localhost", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=my-token; other=1`,
      },
    });

    expect(getSessionTokenFromRequest(request)).toBe("my-token");
  });
});
