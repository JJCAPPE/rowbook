import { router } from "@/server/trpc";
import { authRouter } from "@/server/routers/auth";
import { athleteRouter } from "@/server/routers/athlete";
import { coachRouter } from "@/server/routers/coach";
import { proofRouter } from "@/server/routers/proof";
import { reportingRouter } from "@/server/routers/reporting";
import { weeklyRevealRouter } from "@/server/routers/weekly-reveal";

export const appRouter = router({
  auth: authRouter,
  athlete: athleteRouter,
  coach: coachRouter,
  proof: proofRouter,
  reporting: reportingRouter,
  weeklyReveal: weeklyRevealRouter,
});

export type AppRouter = typeof appRouter;
