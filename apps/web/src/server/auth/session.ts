import { createHash } from "crypto";
import { parse, serialize } from "cookie";
import { nanoid } from "nanoid";

export const SESSION_COOKIE_NAME = "rowbook_session";
export const SESSION_TTL_DAYS = 30;

export const createSessionToken = () => nanoid(32);

export const hashSessionToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const getSessionExpiresAt = (now: Date = new Date()) => {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt;
};

export const createSessionCookie = (token: string, expiresAt: Date) =>
  serialize(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });

export const clearSessionCookie = () =>
  serialize(SESSION_COOKIE_NAME, "", {
    path: "/",
    expires: new Date(0),
  });

export const getSessionTokenFromRequest = (req: Request) => {
  const header = req.headers.get("cookie");
  if (!header) {
    return null;
  }

  const cookies = parse(header);
  return cookies[SESSION_COOKIE_NAME] ?? null;
};
