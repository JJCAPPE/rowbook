"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { Settings, ShieldCheck, Users, UserSquare } from "lucide-react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { NavItem } from "@/components/layout/navigation";
import { trpc } from "@/lib/trpc";
import { buildWeekOptions } from "@/lib/week-options";

export default function CoachLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, isLoading: isSessionLoading } = trpc.auth.getSession.useQuery();
  const isCoach = session?.user.role === "COACH" || session?.user.role === "ADMIN";
  const { data: overview } = trpc.coach.getTeamOverview.useQuery(undefined, {
    retry: false,
    enabled: !isSessionLoading && isCoach,
  });
  const weekOptions = useMemo(() => buildWeekOptions(6), []);
  const userName = session?.user.name ?? session?.user.email ?? "Coach";
  const athleteId = overview?.leaderboard?.[0]?.athleteId;

  useEffect(() => {
    if (!isSessionLoading && session && !isCoach) {
      router.replace("/athlete");
    }
  }, [isCoach, isSessionLoading, router, session]);

  if (isSessionLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (session && !isCoach) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-sm text-default-500">
        Redirecting to the athlete dashboard...
      </div>
    );
  }

  const navItems: NavItem[] = [
    { href: "/coach", label: "Overview", icon: Users },
    ...(athleteId
      ? [{ href: `/coach/athlete/${athleteId}`, label: "Athlete", icon: UserSquare }]
      : []),
    { href: "/coach/review", label: "Review", icon: ShieldCheck },
    { href: "/coach/settings", label: "Settings", icon: Settings },
  ];

  return (
    <AppShell
      title="Coach"
      userName={userName}
      navItems={navItems}
      weekOptions={weekOptions}
      activeWeekKey={weekOptions[0]?.key}
    >
      {children}
    </AppShell>
  );
}
