import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader, Divider } from "@heroui/react";

import { getSessionFromRequest } from "@/server/services/auth-service";

const getHomeSession = async () => {
  try {
    const requestHeaders = await headers();
    const request = new Request("http://rowbook.local", {
      headers: new Headers(requestHeaders),
    });

    return await getSessionFromRequest(request, {});
  } catch {
    return null;
  }
};

export default async function HomePage() {
  const session = await getHomeSession();

  if (session) {
    redirect(
      session.user.role === "COACH" || session.user.role === "ADMIN"
        ? "/coach"
        : "/athlete",
    );
  }

  return (
    <main className="relative flex min-h-dvh w-full min-w-0 items-center justify-center bg-gradient-to-br from-background via-content1 to-content2 px-[min(1rem,4vw)] py-10 sm:py-16">
      <div className="mx-auto w-full min-w-0 max-w-3xl">
        <Card className="w-full min-w-0 overflow-visible [overflow-wrap:anywhere]">
          <CardHeader className="min-w-0 flex-col gap-3 px-[min(1.25rem,5vw)] py-6 text-center sm:px-8 sm:py-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-default-500">
              Rowbook
            </p>
            <h1 className="text-balance text-3xl font-semibold text-foreground sm:text-4xl">
              Weekly minutes, proof, and accountability in one place.
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-default-500">
              Rowbook helps programs track weekly training requirements. Athletes log
              workouts with proof, and coaches review compliance without chasing
              spreadsheets.
            </p>
          </CardHeader>
          <Divider />
          <CardBody className="min-w-0 [overflow-wrap:anywhere] flex flex-col gap-6 px-[min(1.25rem,5vw)] py-6 sm:px-8 sm:py-8">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 rounded-2xl border border-divider/40 bg-content2/70 p-[min(1rem,5vw)] text-left">
                <p className="text-sm font-semibold text-foreground">For athletes</p>
                <p className="mt-1 text-sm leading-relaxed text-default-500">
                  Log sessions quickly, attach proof, and see your weekly goal at a
                  glance.
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-divider/40 bg-content2/70 p-[min(1rem,5vw)] text-left">
                <p className="text-sm font-semibold text-foreground">For coaches</p>
                <p className="mt-1 text-sm leading-relaxed text-default-500">
                  Review compliance, verify proof, and keep the team aligned each week.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 text-center">
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-[min(1.5rem,8vw)] text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Sign in with Google
              </Link>
              <p className="max-w-lg text-xs leading-relaxed text-default-500">
                Access is managed by your program. If you need an account, contact your
                coach or administrator.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
