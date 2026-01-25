"use client";

import type { LucideIcon } from "lucide-react";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

const isActivePath = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export const SidebarNav = ({ items, className }: NavigationProps) => {
  const pathname = usePathname();

  return (
    <nav className={cn("hidden w-64 flex-col border-r border-slate-100 bg-white p-6 md:flex", className)}>
      <Link href="/" className="text-xl font-semibold text-ink">
        Rowbook
      </Link>
      <div className="mt-8 flex flex-1 flex-col gap-2">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition",
                active
                  ? "bg-blue-50 text-primary"
                  : "text-slate-600 hover:bg-slate-50 hover:text-ink",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="mt-auto text-xs text-slate-400">
        Sunday cutoff at 6:00 PM ET
      </div>
    </nav>
  );
};

export const BottomNav = ({ items, className }: NavigationProps) => {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white px-4 py-3 md:hidden",
        className,
      )}
    >
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 text-xs font-semibold",
              active ? "text-primary" : "text-slate-500",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};
