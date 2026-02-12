import { describe, expect, it } from "vitest";

import { prisma } from "../../apps/web/src/db/client.ts";
import { getSessionFromRequest } from "../../apps/web/src/server/services/auth-service.ts";

describe("@smoke auth-service", () => {
  it("supports header-based session bypass in test mode", async () => {
    await prisma.user.create({
      data: {
        email: "bypass-athlete@test.local",
        role: "ATHLETE",
        status: "ACTIVE",
        name: "Bypass Athlete",
      },
    });

    const session = await getSessionFromRequest(
      new Request("http://localhost", {
        headers: {
          "x-rowbook-test-email": "bypass-athlete@test.local",
        },
      }),
      {},
    );

    expect(session).not.toBeNull();
    expect(session?.user.email).toBe("bypass-athlete@test.local");
  });
});
