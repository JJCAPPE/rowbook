"use client";

import type { LucideIcon } from "lucide-react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Chip } from "@heroui/react";

import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavigationProps = {
  items: NavItem[];
  className?: string;
};

const getActiveHref = (pathname: string, items: NavItem[]) => {
  if (pathname.startsWith("/athlete/week/")) {
    return items.find((item) => item.href.split("?")[0] === "/athlete/history")
      ?.href;
  }

  if (pathname.startsWith("/coach/athlete/")) {
    return items.find((item) => item.href.startsWith("/coach/athlete/"))?.href;
  }

  return items
    .filter((item) => {
      const itemPath = item.href.split("?")[0];
      return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
    })
    .sort(
      (left, right) =>
        right.href.split("?")[0].length - left.href.split("?")[0].length,
    )[0]?.href;
};

export const SidebarNav = ({ items, className }: NavigationProps) => {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname, items);

  return (
    <nav
      aria-label="Primary navigation"
      className={cn(
        "hidden w-64 flex-col border-r border-divider/40 bg-content1/80 p-6 backdrop-blur-xl md:flex",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="font-display text-xl font-semibold text-foreground"
        >
          Rowbook
        </Link>
        <Chip
          size="sm"
          variant="flat"
          color="secondary"
          className="text-[0.6rem]"
        >
          v1.0
        </Chip>
      </div>
      <div className="mt-8 flex flex-1 flex-col gap-2">
        {items.map((item) => {
          const active = activeHref === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition",
                active
                  ? "border border-divider/60 bg-content2/80 text-foreground shadow-sm"
                  : "text-default-500 hover:bg-content2/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="mt-auto text-xs text-default-500">
        Sunday cutoff at 8:00 PM ET
      </div>
    </nav>
  );
};

export const BottomNav = ({ items, className }: NavigationProps) => {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname, items);

  return (
    <nav
      aria-label="Primary navigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-divider/40 bg-content1/80 px-2 pt-2 backdrop-blur-xl md:hidden",
        className,
      )}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {items.map((item) => {
        const active = activeHref === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
              active ? "text-primary" : "text-default-500",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};
