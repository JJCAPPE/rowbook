import { describe, expect, it, vi } from "vitest";

import { appRouter } from "../../apps/web/src/server/routers/index.ts";
import type { TRPCContext } from "../../apps/web/src/server/context.ts";

const makeContext = (session: TRPCContext["session"]): TRPCContext => ({
  req: new Request("http://localhost/api/trpc"),
  session,
  responseHeaders: {},
  setCookie: vi.fn(),
});

describe("@smoke tRPC authz", () => {
  it("blocks protected procedures without a session", async () => {
    const caller = appRouter.createCaller(makeContext(null));

    await expect(caller.athlete.getHistory()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("blocks athlete procedures for non-athlete roles", async () => {
    const caller = appRouter.createCaller(
      makeContext({
        user: {
          id: "u1",
          email: "coach@test.local",
          name: "Coach",
          role: "COACH",
          status: "ACTIVE",
        },
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );

    await expect(caller.athlete.getHistory()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("blocks coach procedures for athlete roles", async () => {
    const caller = appRouter.createCaller(
      makeContext({
        user: {
          id: "u2",
          email: "athlete@test.local",
          name: "Athlete",
          role: "ATHLETE",
          status: "ACTIVE",
        },
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );

    await expect(caller.coach.getTeamOverview()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns session for public auth procedure", async () => {
    const session = {
      user: {
        id: "u3",
        email: "coach@test.local",
        name: "Coach",
        role: "COACH" as const,
        status: "ACTIVE" as const,
      },
      expiresAt: new Date(Date.now() + 60_000),
    };
    const caller = appRouter.createCaller(makeContext(session));

    await expect(caller.auth.getSession()).resolves.toEqual(session);
  });
});
