"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { WeekSelector } from "@/components/ui/week-selector";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type WeekOption = {
  key: string;
  label: string;
};

type TopBarProps = {
  title: string;
  userName: string;
  weekOptions?: WeekOption[];
  activeWeekKey?: string;
  onWeekChange?: (weekKey: string) => void;
  className?: string;
};

export const TopBar = ({
  title,
  userName,
  weekOptions,
  activeWeekKey,
  onWeekChange,
  className,
}: TopBarProps) => {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { mutate: logout, isLoading: isLoggingOut } = trpc.auth.logout.useMutation({
    onSuccess: () => {
      setIsMenuOpen(false);
      router.replace("/login");
      router.refresh();
    },
  });

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <div
      className={cn(
        "sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-divider/40 bg-content1/80 px-4 py-4 backdrop-blur-xl md:px-8",
        className,
      )}
    >
      <div>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-default-500">
          {title}
        </p>
        <p className="font-display text-lg font-semibold text-foreground">Week overview</p>
      </div>
      <div className="flex items-center gap-4">
        {weekOptions?.length ? (
          <WeekSelector
            weeks={weekOptions}
            value={activeWeekKey ?? weekOptions[0].key}
            onChange={onWeekChange}
          />
        ) : null}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label="Open user menu"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
          >
            <Avatar name={userName} />
          </button>
          {isMenuOpen ? (
            <div className="absolute right-0 mt-2 w-36 rounded-2xl border border-divider/60 bg-content1/95 p-2 shadow-lg backdrop-blur-xl">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm"
                onClick={() => logout()}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Logging out..." : "Log out"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
