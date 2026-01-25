import { appendHeader, type ResponseHeaders } from "@/server/auth/headers";
import { getSessionFromRequest } from "@/server/services/auth-service";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: "ATHLETE" | "COACH" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
};

export type SessionContext = {
  user: SessionUser;
  expiresAt: Date;
};

export type TRPCContext = {
  req: Request;
  session: SessionContext | null;
  responseHeaders: ResponseHeaders;
  setCookie: (cookie: string) => void;
};

const toSessionUser = (user: {
  id: string;
  email: string;
  name: string | null;
  role: "ATHLETE" | "COACH" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
}) => ({
  id: user.id,
  email: user.email,
  name: user.name ?? null,
  role: user.role,
  status: user.status,
});

export const createTRPCContext = async ({ req }: { req: Request }) => {
  const responseHeaders: ResponseHeaders = {};
  const session = await getSessionFromRequest(req, responseHeaders);

  return {
    req,
    responseHeaders,
    setCookie: (cookie: string) => {
      appendHeader(responseHeaders, "Set-Cookie", cookie);
    },
    session: session
      ? {
          user: toSessionUser(session.user),
          expiresAt: session.expiresAt,
        }
      : null,
  } satisfies TRPCContext;
};
