"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Home, PlusCircle, Trophy } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { NavItem } from "@/components/layout/navigation";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  buildWeekOptions,
  getWeekOptionsRefreshDelay,
  SEASON_WEEK_OPTION_COUNT,
} from "@/lib/week-options";
import { clearRowbookSessionStorage } from "@/lib/session-storage";

export default function AthleteLayoutClient({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    data: session,
    error: sessionError,
    isFetching: isSessionFetching,
    isLoading: isSessionLoading,
    refetch: refetchSession,
  } = trpc.auth.getSession.useQuery(undefined, { retry: false });
  const [weekOptions, setWeekOptions] = useState(() =>
    buildWeekOptions(SEASON_WEEK_OPTION_COUNT),
  );
  const currentWeekKeyRef = useRef(weekOptions[0]?.key);
  const userName = session?.user.name ?? session?.user.email ?? "Athlete";
  const searchWeekKey = searchParams.get("weekStartAt");
  const supportsWeekSelection =
    pathname === "/athlete" ||
    pathname === "/athlete/leaderboard" ||
    pathname.startsWith("/athlete/week/");
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

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const refreshWeekOptions = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      const now = new Date();
      const nextOptions = buildWeekOptions(SEASON_WEEK_OPTION_COUNT, now);
      const nextCurrentWeekKey = nextOptions[0]?.key;
      setWeekOptions(nextOptions);
      if (
        currentWeekKeyRef.current &&
        nextCurrentWeekKey &&
        currentWeekKeyRef.current !== nextCurrentWeekKey
      ) {
        void queryClient.invalidateQueries();
      }
      currentWeekKeyRef.current = nextCurrentWeekKey;
      refreshTimer = setTimeout(
        refreshWeekOptions,
        getWeekOptionsRefreshDelay(now),
      );
    };

    const refreshVisibleOptions = () => {
      if (document.visibilityState === "visible") {
        refreshWeekOptions();
      }
    };

    refreshWeekOptions();
    window.addEventListener("focus", refreshWeekOptions);
    document.addEventListener("visibilitychange", refreshVisibleOptions);

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      window.removeEventListener("focus", refreshWeekOptions);
      document.removeEventListener("visibilitychange", refreshVisibleOptions);
    };
  }, [queryClient]);

  useEffect(() => {
    if (isSessionLoading || sessionError) {
      return;
    }
    if (!session) {
      clearRowbookSessionStorage();
      router.replace("/login");
      return;
    }
    if (session.user.role === "COACH" || session.user.role === "ADMIN") {
      router.replace("/coach");
    }
  }, [isSessionLoading, router, session, sessionError]);

  if (isSessionLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (sessionError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-sm text-rose-600">Unable to verify your session.</p>
        <Button
          size="sm"
          variant="outline"
          disabled={isSessionFetching}
          onClick={() => void refetchSession()}
        >
          {isSessionFetching ? "Checking..." : "Try again"}
        </Button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-sm text-default-500">
        Redirecting to login...
      </div>
    );
  }

  if (session.user.role === "COACH" || session.user.role === "ADMIN") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-sm text-default-500">
        Redirecting to the coach dashboard...
      </div>
    );
  }

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
      weekOptions={supportsWeekSelection ? weekOptions : undefined}
      activeWeekKey={activeWeekKey}
      onWeekChange={
        supportsWeekSelection
          ? (nextWeekKey) => {
              if (pathname.startsWith("/athlete/week/")) {
                router.push(`/athlete/week/${encodeURIComponent(nextWeekKey)}`);
                return;
              }

              const params = new URLSearchParams(searchParams.toString());
              params.set("weekStartAt", nextWeekKey);
              router.push(`${pathname}?${params.toString()}`);
            }
          : undefined
      }
    >
      {children}
    </AppShell>
  );
}
