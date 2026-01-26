"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { Calendar, Home, PlusCircle, Trophy } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { NavItem } from "@/components/layout/navigation";
import { trpc } from "@/lib/trpc";
import { buildWeekOptions } from "@/lib/week-options";

export default function AthleteLayoutClient({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = trpc.auth.getSession.useQuery();
  const weekOptions = useMemo(() => buildWeekOptions(6), []);
  const userName = session?.user.name ?? session?.user.email ?? "Athlete";
  const searchWeekKey = searchParams.get("weekStartAt");
  const routeWeekKey = useMemo(() => {
    if (!pathname.startsWith("/athlete/week/")) {
      return null;
    }

    const rawSegment = pathname.split("/").pop();
    if (!rawSegment) {
      return null;
    }

    try {
      return decodeURIComponent(rawSegment);
    } catch {
      return rawSegment;
    }
  }, [pathname]);

  const activeWeekKey = useMemo(() => {
    const candidate = searchWeekKey ?? routeWeekKey;
    if (candidate && weekOptions.some((option) => option.key === candidate)) {
      return candidate;
    }
    return weekOptions[0]?.key;
  }, [searchWeekKey, routeWeekKey, weekOptions]);

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
      activeWeekKey={activeWeekKey}
      onWeekChange={(nextWeekKey) => {
        if (pathname.startsWith("/athlete/week/")) {
          router.push(`/athlete/week/${encodeURIComponent(nextWeekKey)}`);
          return;
        }

        const params = new URLSearchParams(searchParams.toString());
        params.set("weekStartAt", nextWeekKey);
        router.push(`${pathname}?${params.toString()}`);
      }}
    >
      {children}
    </AppShell>
  );
}
