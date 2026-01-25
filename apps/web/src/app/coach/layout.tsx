"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { Settings, ShieldCheck, Users, UserSquare } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { NavItem } from "@/components/layout/navigation";
import { trpc } from "@/lib/trpc";
import { buildWeekOptions } from "@/lib/week-options";

export default function CoachLayout({ children }: { children: ReactNode }) {
  const { data: session } = trpc.auth.getSession.useQuery();
  const { data: overview } = trpc.coach.getTeamOverview.useQuery(undefined, {
    retry: false,
  });
  const weekOptions = useMemo(() => buildWeekOptions(6), []);
  const userName = session?.user.name ?? session?.user.email ?? "Coach";
  const athleteId = overview?.leaderboard?.[0]?.athleteId;

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
