"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { Calendar, Home, PlusCircle, Trophy } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { NavItem } from "@/components/layout/navigation";
import { trpc } from "@/lib/trpc";
import { buildWeekOptions } from "@/lib/week-options";

export default function AthleteLayout({ children }: { children: ReactNode }) {
  const { data: session } = trpc.auth.getSession.useQuery();
  const weekOptions = useMemo(() => buildWeekOptions(6), []);
  const userName = session?.user.name ?? session?.user.email ?? "Athlete";

  const navItems: NavItem[] = [
    { href: "/athlete", label: "Dashboard", icon: Home },
    { href: "/athlete/log", label: "Log", icon: PlusCircle },
    { href: "/athlete/history", label: "History", icon: Calendar },
    { href: "/athlete/leaderboard", label: "Leaderboard", icon: Trophy },
  ];

  return (
    <AppShell
      title="Athlete"
      userName={userName}
      navItems={navItems}
      weekOptions={weekOptions}
      activeWeekKey={weekOptions[0]?.key}
    >
      {children}
    </AppShell>
  );
}
