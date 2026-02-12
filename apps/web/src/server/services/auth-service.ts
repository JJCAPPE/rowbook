import { prisma } from "@/db/client";
import type { ResponseHeaders } from "@/server/auth/headers";
import { createSupabaseServerClientFromRequest } from "@/server/auth/supabase";

const TEST_AUTH_EMAIL_HEADER = "x-rowbook-test-email";

const getBypassSessionFromRequest = async (req: Request) => {
  if (process.env.NODE_ENV !== "test" || process.env.TEST_AUTH_BYPASS !== "1") {
    return null;
  }

  const rawEmail = req.headers.get(TEST_AUTH_EMAIL_HEADER);
  if (!rawEmail) {
    return null;
  }

  const email = rawEmail.trim().toLowerCase();
  if (!email) {
    return null;
  }

  const dbUser = await prisma.user.findUnique({
    where: { email },
  });
  if (!dbUser || dbUser.status !== "ACTIVE") {
    return null;
  }

  return {
    user: dbUser,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
};

export const getSessionFromRequest = async (
  req: Request,
  responseHeaders: ResponseHeaders,
) => {
  const bypassSession = await getBypassSessionFromRequest(req);
  if (bypassSession) {
    return bypassSession;
  }

  const supabase = createSupabaseServerClientFromRequest(req, responseHeaders);
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    return null;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email) {
    return null;
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: userData.user.email },
  });

  if (!dbUser || dbUser.status !== "ACTIVE") {
    return null;
  }

  const expiresAt = sessionData.session.expires_at
    ? new Date(sessionData.session.expires_at * 1000)
    : new Date();

  return {
    user: dbUser,
    expiresAt,
  };
};
