import type { ReactNode } from "react";

import { BottomNav, NavItem, SidebarNav } from "@/components/layout/navigation";
import { TopBar } from "@/components/layout/top-bar";
import { cn } from "@/lib/utils";

type WeekOption = {
  key: string;
  label: string;
};

type AppShellProps = {
  title: string;
  userName: string;
  navItems: NavItem[];
  weekOptions?: WeekOption[];
  activeWeekKey?: string;
  children: ReactNode;
};

export const AppShell = ({
  title,
  userName,
  navItems,
  weekOptions,
  activeWeekKey,
  children,
}: AppShellProps) => (
  <div className="min-h-screen bg-slate-50">
    <div className="flex min-h-screen">
      <SidebarNav items={navItems} />
      <div className="flex flex-1 flex-col">
        <TopBar
          title={title}
          userName={userName}
          weekOptions={weekOptions}
          activeWeekKey={activeWeekKey}
        />
        <main className={cn("flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-12")}>
          {children}
        </main>
      </div>
    </div>
    <BottomNav items={navItems} />
  </div>
);
