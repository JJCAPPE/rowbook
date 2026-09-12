"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { WeekSelector } from "@/components/ui/week-selector";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { clearRowbookSessionStorage } from "@/lib/session-storage";

type WeekOption = {
  key: string;
  label: string;
};

type TeamOption = {
  id: string;
  name: string;
};

type TopBarProps = {
  title: string;
  userName: string;
  weekOptions?: WeekOption[];
  activeWeekKey?: string;
  onWeekChange?: (weekKey: string) => void;
  teamOptions?: TeamOption[];
  activeTeamId?: string;
  onTeamChange?: (teamId: string) => void;
  className?: string;
};

export const TopBar = ({
  title,
  userName,
  weekOptions,
  activeWeekKey,
  onWeekChange,
  teamOptions,
  activeTeamId,
  onTeamChange,
  className,
}: TopBarProps) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const menuTriggerId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const { mutate: logout, isLoading: isLoggingOut } =
    trpc.auth.logout.useMutation({
      onSuccess: () => {
        queryClient.clear();
        clearRowbookSessionStorage();
        setLogoutError(null);
        setIsMenuOpen(false);
        router.replace("/login");
        router.refresh();
      },
      onError: () => {
        setLogoutError(
          "We couldn't log you out. Check your connection and try again.",
        );
      },
    });

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    });

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsMenuOpen(false);
        menuTriggerRef.current?.focus();
      } else if (event.key === "Tab") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <div
      className={cn(
        "sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-divider/40 bg-content1/80 px-4 py-4 backdrop-blur-xl md:px-8",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-default-500">
          {title}
        </p>
        <p className="font-display text-lg font-semibold text-foreground">
          {weekOptions?.length ? "Week overview" : "Rowbook"}
        </p>
      </div>
      <div className="ml-auto flex max-w-full items-center gap-3">
        {teamOptions?.length ? (
          <label className="min-w-0">
            <span className="sr-only">Team</span>
            <select
              className="input-field h-10 max-w-[min(14rem,calc(100vw-7rem))] truncate py-0 text-sm"
              value={activeTeamId ?? teamOptions[0].id}
              onChange={(event) => onTeamChange?.(event.target.value)}
            >
              {teamOptions.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {weekOptions?.length ? (
          <WeekSelector
            weeks={weekOptions}
            value={activeWeekKey ?? weekOptions[0].key}
            onChange={onWeekChange}
            className="max-w-[min(15rem,calc(100vw-6rem))]"
          />
        ) : null}
        <div className="relative" ref={menuRef}>
          <button
            ref={menuTriggerRef}
            id={menuTriggerId}
            type="button"
            className="rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40"
            onClick={() => {
              setIsMenuOpen((open) => !open);
            }}
            aria-label={isMenuOpen ? "Close user menu" : "Open user menu"}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-controls={isMenuOpen ? menuId : undefined}
          >
            <Avatar name={userName} />
          </button>
          {isMenuOpen ? (
            <div
              id={menuId}
              role="menu"
              aria-labelledby={menuTriggerId}
              className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-divider/60 bg-content1/95 p-2 shadow-lg backdrop-blur-xl"
            >
              <div role="none" className="space-y-2">
                {logoutError ? (
                  <p
                    role="alert"
                    className="px-2 pt-1 text-xs leading-relaxed text-rose-600"
                  >
                    {logoutError}
                  </p>
                ) : null}
                <Button
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-sm"
                  onClick={() => {
                    if (
                      document.body.dataset.rowbookUnsavedSettings === "true" &&
                      !window.confirm(
                        "Discard your unsaved weekly setting changes and log out?",
                      )
                    ) {
                      return;
                    }
                    setLogoutError(null);
                    logout();
                  }}
                  disabled={isLoggingOut}
                >
                  {isLoggingOut
                    ? "Logging out..."
                    : logoutError
                      ? "Try logging out again"
                      : "Log out"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
