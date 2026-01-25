import type { ReactNode } from "react";
import { Calendar, Home, PlusCircle, Trophy } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { NavItem } from "@/components/layout/navigation";
import { athleteProfile, weekOptions } from "@/lib/mock-data";

const navItems: NavItem[] = [
  { href: "/athlete", label: "Dashboard", icon: Home },
  { href: "/athlete/log", label: "Log", icon: PlusCircle },
  { href: "/athlete/history", label: "History", icon: Calendar },
  { href: "/athlete/leaderboard", label: "Leaderboard", icon: Trophy },
];

export default function AthleteLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      title="Athlete"
      userName={athleteProfile.name}
      navItems={navItems}
      weekOptions={weekOptions}
      activeWeekKey={weekOptions[0]?.key}
    >
      {children}
    </AppShell>
  );
}
