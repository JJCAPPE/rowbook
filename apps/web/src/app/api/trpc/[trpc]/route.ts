import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { ZodError } from "zod";
import { appRouter } from "@/server/routers";
import { createTRPCContext } from "@/server/context";

const handler = (req: Request) => {
  const startedAt = performance.now();
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ req }),
    responseMeta: ({ ctx }) => ({
      headers: ctx?.responseHeaders,
    }),
    onError: ({ path, error }) => {
      console.error("tRPC request failed", {
        path,
        code: error.code,
        durationMs: Math.round(performance.now() - startedAt),
        cause: error.cause?.name,
        validationIssues:
          error.cause?.name === "ZodError"
            ? (error.cause as ZodError).issues.map(({ path, code }) => ({ path, code }))
            : undefined,
      });
    },
  });
};

export { handler as GET, handler as POST };
