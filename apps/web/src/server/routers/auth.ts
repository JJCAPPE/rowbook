import { TRPCError } from "@trpc/server";
import { createSupabaseServerClientFromRequest } from "@/server/auth/supabase";
import { publicProcedure, protectedProcedure, router } from "@/server/trpc";

export const authRouter = router({
  getSession: publicProcedure.query(({ ctx }) => ctx.session),
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const supabase = createSupabaseServerClientFromRequest(
      ctx.req,
      ctx.responseHeaders,
    );
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to log out.",
      });
    }
    return { success: true };
  }),
});
