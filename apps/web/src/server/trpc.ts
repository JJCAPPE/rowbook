import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { isCoachRole } from "@/server/auth/rbac";
import type { TRPCContext } from "@/server/context";

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx });
});

const isCoach = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (!isCoachRole(ctx.session.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const coachProcedure = t.procedure.use(isCoach);
