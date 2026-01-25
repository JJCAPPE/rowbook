import { prisma } from "@/db/client";
import { getSessionTokenFromRequest, getSessionExpiresAt, hashSessionToken, createSessionToken } from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/password";

export const loginWithPassword = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE" || !user.passwordHash) {
    return null;
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    return null;
  }

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = getSessionExpiresAt();

  await prisma.session.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt,
    },
  });

  return {
    user,
    token,
    expiresAt,
  };
};

export const getSessionFromRequest = async (req: Request) => {
  const token = getSessionTokenFromRequest(req);
  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { tokenHash } });
    return null;
  }

  return {
    user: session.user,
    expiresAt: session.expiresAt,
  };
};
