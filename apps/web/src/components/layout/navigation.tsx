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

const isActivePath = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export const SidebarNav = ({ items, className }: NavigationProps) => {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "hidden w-64 flex-col border-r border-divider/40 bg-content1/80 p-6 backdrop-blur-xl md:flex",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Link href="/" className="font-display text-xl font-semibold text-foreground">
          Rowbook
        </Link>
        <Chip size="sm" variant="flat" color="secondary" className="text-[0.6rem]">
          v1.0
        </Chip>
      </div>
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
                  ? "border border-divider/60 bg-content2/80 text-foreground shadow-sm"
                  : "text-default-500 hover:bg-content2/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="mt-auto text-xs text-default-500">
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
        "fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-divider/40 bg-content1/80 px-4 py-3 backdrop-blur-xl md:hidden",
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
              "flex flex-col items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em]",
              active ? "text-primary" : "text-default-500",
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
