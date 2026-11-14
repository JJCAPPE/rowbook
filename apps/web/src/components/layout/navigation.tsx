"use client";

import type { LucideIcon } from "lucide-react";
import { Clock3 } from "lucide-react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Chip } from "@heroui/react";

import { cn } from "@/lib/utils";
import styles from "./navigation.module.css";

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
        "fixed inset-y-0 left-0 z-40 hidden flex-col overflow-x-hidden overflow-y-auto border-r border-divider/40 bg-content1 px-3 py-6 md:flex",
        styles.sidebar,
        className,
      )}
    >
      <div className="flex shrink-0 items-center">
        <Link
          href="/"
          aria-label="Rowbook home"
          className="flex h-11 items-center gap-3 rounded-xl font-display text-xl font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <span aria-hidden="true" className="w-11 shrink-0 text-center">
            R
          </span>
          <span className={styles.label}>Rowbook</span>
        </Link>
        <Chip
          size="sm"
          variant="flat"
          color="secondary"
          className={cn("ml-3 shrink-0 text-[0.6rem]", styles.label)}
        >
          v2
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
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground motion-reduce:transition-none",
                active
                  ? "border-divider/60 bg-content2/80 text-foreground shadow-sm"
                  : "border-transparent text-default-500 hover:bg-content2/60 hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className={styles.label}>{item.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="mt-8 flex shrink-0 items-center gap-3 px-3 text-xs text-default-500">
        <Clock3 className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className={styles.label}>
          Sunday cutoff
          <br />
          at 8:00 PM ET
        </span>
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
        "fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-divider/40 bg-content1/95 pt-2 backdrop-blur-xl md:hidden",
        className,
      )}
      style={{
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
        paddingRight: "max(0.5rem, env(safe-area-inset-right))",
      }}
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
              "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-center text-[0.6875rem] font-semibold leading-tight transition-colors",
              active ? "bg-content3 text-foreground" : "text-default-500",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className={cn("max-w-full break-words", active && "underline decoration-2 underline-offset-4")}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};
