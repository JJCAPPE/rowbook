import { TRPCError } from "@trpc/server";
import { LoginInputSchema } from "@rowbook/shared";
import { prisma } from "@/db/client";
import { clearSessionCookie, createSessionCookie, getSessionTokenFromRequest, hashSessionToken } from "@/server/auth/session";
import { loginWithPassword } from "@/server/services/auth-service";
import { publicProcedure, protectedProcedure, router } from "@/server/trpc";

export const authRouter = router({
  getSession: publicProcedure.query(({ ctx }) => ctx.session),
  login: publicProcedure.input(LoginInputSchema).mutation(async ({ input, ctx }) => {
    const result = await loginWithPassword(input.email, input.password);
    if (!result) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials." });
    }

    ctx.setCookie(createSessionCookie(result.token, result.expiresAt));

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name ?? null,
        role: result.user.role,
        status: result.user.status,
      },
      expiresAt: result.expiresAt,
    };
  }),
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const token = getSessionTokenFromRequest(ctx.req);
    if (token) {
      const tokenHash = hashSessionToken(token);
      await prisma.session.deleteMany({ where: { tokenHash } });
    }
    ctx.setCookie(clearSessionCookie());
    return { success: true };
  }),
});
