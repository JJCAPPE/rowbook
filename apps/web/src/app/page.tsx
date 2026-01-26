"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader, Divider, Tab, Tabs, Tooltip } from "@heroui/react";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type FocusKey = "athlete" | "coach" | "weekly";

type FocusCopy = {
  title: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
};

const tabOptions: Array<{
  key: FocusKey;
  label: string;
  tooltipContent: string;
}> = [
  {
    key: "athlete",
    label: "Athlete",
    tooltipContent: "Log workouts, upload proof, and track weekly minutes.",
  },
  {
    key: "coach",
    label: "Coach",
    tooltipContent: "Review compliance, proof status, and team trends.",
  },
  {
    key: "weekly",
    label: "Weekly",
    tooltipContent: "Set requirements, exemptions, and week boundaries.",
  },
];

const focusCopy: Record<FocusKey, FocusCopy> = {
  athlete: {
    title: "Log minutes fast",
    description: "Submit workouts in under a minute with proof-first logging.",
    primaryLabel: "Log workout",
    primaryHref: "/athlete",
    secondaryLabel: "View history",
    secondaryHref: "/athlete/history",
  },
  coach: {
    title: "Review the team",
    description: "See compliance at a glance and verify proof status quickly.",
    primaryLabel: "Open overview",
    primaryHref: "/coach",
    secondaryLabel: "Review queue",
    secondaryHref: "/coach/review",
  },
  weekly: {
    title: "Keep the week aligned",
    description: "Adjust required minutes and manage exemptions in one place.",
    primaryLabel: "Weekly settings",
    primaryHref: "/coach/settings",
    secondaryLabel: "Coach demo",
    secondaryHref: "/coach",
  },
};

export default function HomePage() {
  const [focusArea, setFocusArea] = useState<FocusKey>("athlete");
  const { data: session, isLoading: isSessionLoading } = trpc.auth.getSession.useQuery();
  const isCoach = session?.user.role === "COACH" || session?.user.role === "ADMIN";
  const showCoachOptions = !isSessionLoading && (isCoach || !session);
  const visibleTabs = useMemo(
    () => (showCoachOptions ? tabOptions : tabOptions.filter((tab) => tab.key === "athlete")),
    [showCoachOptions],
  );
  const activeFocusArea = showCoachOptions ? focusArea : "athlete";
  const activeCopy = useMemo(() => focusCopy[activeFocusArea], [activeFocusArea]);

  useEffect(() => {
    if (!showCoachOptions && focusArea !== "athlete") {
      setFocusArea("athlete");
    }
  }, [focusArea, showCoachOptions]);

  return (
    <div className="mx-auto flex min-h-screen w-[90vw] flex-col gap-10 py-12 lg:flex-row lg:items-start">
      <div className="w-full lg:max-w-[620px]">
        <Card className="w-full">
          <CardHeader className="flex-col gap-3 text-center">
            <p className="text-2xl font-bold">Rowbook weekly minutes</p>
            <p className="text-small text-default-500">
              Keep workouts, proof, and accountability in one place.
            </p>
          </CardHeader>
          <Divider />
          <CardBody>
            <div className="flex flex-col gap-4">
              <Card className="w-full border-2 border-default-200 bg-transparent shadow-none">
                <CardBody className="flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-default-500">Focus this week</p>
                  <p className="text-lg font-semibold">{activeCopy.title}</p>
                  <p className="max-w-sm text-sm text-default-500">
                    {activeCopy.description}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      as={Link}
                      href={activeCopy.primaryHref}
                      radius="full"
                    >
                      {activeCopy.primaryLabel}
                    </Button>
                    <Button
                      as={Link}
                      href={activeCopy.secondaryHref}
                      variant="outline"
                      radius="full"
                    >
                      {activeCopy.secondaryLabel}
                    </Button>
                  </div>
                </CardBody>
              </Card>

              <div className="flex w-full justify-center">
                <Tabs
                  selectedKey={activeFocusArea}
                  onSelectionChange={(key) => setFocusArea(key as FocusKey)}
                  color="primary"
                  variant="bordered"
                >
                  {visibleTabs.map((tab) => (
                    <Tab
                      key={tab.key}
                      title={
                        <Tooltip
                          content={tab.tooltipContent}
                          placement="top"
                          color={focusArea === tab.key ? "primary" : undefined}
                        >
                          <span>{tab.label}</span>
                        </Tooltip>
                      }
                    />
                  ))}
                </Tabs>
              </div>

              <div className="flex flex-wrap justify-center gap-3">
                <Button as={Link} href="/login" variant="ghost" radius="full">
                  Log in
                </Button>
                <Button as={Link} href="/athlete" radius="full">
                  Athlete demo
                </Button>
                {showCoachOptions ? (
                  <Button as={Link} href="/coach" radius="full">
                    Coach demo
                  </Button>
                ) : null}
              </div>

              <p className="text-center text-xs text-default-500">
                Sunday cutoff at 6:00 PM ET. Proof review updates instantly.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="w-full flex-1">
        <Card className="w-full">
          <CardHeader className="flex-col items-start gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-default-500">
              Weekly snapshot
            </p>
            <p className="text-2xl font-semibold">108 minutes logged</p>
            <p className="text-sm text-default-500">3 athletes pending proof</p>
          </CardHeader>
          <Divider />
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-2 border-default-200 bg-transparent shadow-none">
                <CardBody className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-default-500">
                    Compliance
                  </p>
                  <p className="text-2xl font-semibold">84%</p>
                  <p className="text-xs text-default-500">12 of 14 athletes</p>
                </CardBody>
              </Card>
              <Card className="border-2 border-default-200 bg-transparent shadow-none">
                <CardBody className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-default-500">
                    Proof status
                  </p>
                  <p className="text-2xl font-semibold">7 due</p>
                  <p className="text-xs text-default-500">Auto reminders on</p>
                </CardBody>
              </Card>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-default-500">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary" />
                Proof-first workflow
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-default-400" />
                One-minute logging
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-default-400" />
                Weekly accountability
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
