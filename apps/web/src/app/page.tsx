import Link from "next/link";
import { Card, CardBody, CardHeader, Divider } from "@heroui/react";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-background via-content1 to-content2 py-16">
      <div className="mx-auto w-[90vw] max-w-3xl">
        <Card className="w-full overflow-hidden">
          <CardHeader className="flex-col gap-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-default-500">
              Rowbook
            </p>
            <p className="text-3xl font-semibold text-foreground sm:text-4xl">
              Weekly minutes, proof, and accountability in one place.
            </p>
            <p className="text-sm text-default-500">
              Rowbook helps programs track weekly training requirements. Athletes log
              workouts with proof, and coaches review compliance without chasing
              spreadsheets.
            </p>
          </CardHeader>
          <Divider />
          <CardBody className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-divider/40 bg-content2/70 p-4 text-left">
                <p className="text-sm font-semibold text-foreground">For athletes</p>
                <p className="text-sm text-default-500">
                  Log sessions quickly, attach proof, and see your weekly goal at a
                  glance.
                </p>
              </div>
              <div className="rounded-2xl border border-divider/40 bg-content2/70 p-4 text-left">
                <p className="text-sm font-semibold text-foreground">For coaches</p>
                <p className="text-sm text-default-500">
                  Review compliance, verify proof, and keep the team aligned each week.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 text-center">
              <Button as={Link} href="/login" radius="full">
                Log in
              </Button>
              <p className="text-xs text-default-500">
                Access is managed by your program. If you need an account, contact your
                coach or administrator.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
