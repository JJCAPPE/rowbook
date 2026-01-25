import type { ReactNode } from "react";
import { Settings, ShieldCheck, Users, UserSquare } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { NavItem } from "@/components/layout/navigation";
import { weekOptions } from "@/lib/mock-data";

const navItems: NavItem[] = [
  { href: "/coach", label: "Overview", icon: Users },
  { href: "/coach/athlete/athlete-1", label: "Athlete", icon: UserSquare },
  { href: "/coach/review", label: "Review", icon: ShieldCheck },
  { href: "/coach/settings", label: "Settings", icon: Settings },
];

export default function CoachLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      title="Coach"
      userName="Coach Alex"
      navItems={navItems}
      weekOptions={weekOptions}
      activeWeekKey={weekOptions[0]?.key}
    >
      {children}
    </AppShell>
  );
}
