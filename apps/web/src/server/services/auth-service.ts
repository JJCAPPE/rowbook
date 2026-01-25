import { prisma } from "@/db/client";
import type { ResponseHeaders } from "@/server/auth/headers";
import { createSupabaseServerClientFromRequest } from "@/server/auth/supabase";

export const getSessionFromRequest = async (
  req: Request,
  responseHeaders: ResponseHeaders,
) => {
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
