"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Settings, ShieldCheck, Users, UserSquare } from "lucide-react";
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

export default function CoachLayoutClient({
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
  const isCoach =
    session?.user.role === "COACH" || session?.user.role === "ADMIN";
  const {
    data: teams,
    error: teamsError,
    isLoading: isTeamsLoading,
    isFetching: isTeamsFetching,
    refetch: refetchTeams,
  } = trpc.coach.listTeams.useQuery(undefined, {
    retry: false,
    enabled: !isSessionLoading && !sessionError && isCoach,
  });
  const requestedTeamId = searchParams.get("teamId");
  const activeTeamId =
    teams?.find((team) => team.id === requestedTeamId)?.id ?? teams?.[0]?.id;
  const { data: athletes } = trpc.coach.listAthletes.useQuery(
    activeTeamId ? { teamId: activeTeamId } : undefined,
    {
      retry: false,
      enabled:
        !isSessionLoading && !sessionError && isCoach && Boolean(activeTeamId),
    },
  );
  const [weekOptions, setWeekOptions] = useState(() =>
    buildWeekOptions(SEASON_WEEK_OPTION_COUNT),
  );
  const [accountActionError, setAccountActionError] = useState<string | null>(
    null,
  );
  const currentWeekKeyRef = useRef(weekOptions[0]?.key);
  const userName = session?.user.name ?? session?.user.email ?? "Coach";
  const athleteId = athletes?.[0]?.id;
  const searchWeekKey = searchParams.get("weekStartAt");
  const supportsWeekSelection =
    pathname === "/coach" ||
    pathname === "/coach/review" ||
    pathname === "/coach/settings";
  const activeWeekKey = useMemo(() => {
    if (
      searchWeekKey &&
      weekOptions.some((option) => option.key === searchWeekKey)
    ) {
      return searchWeekKey;
    }
    return weekOptions[0]?.key;
  }, [searchWeekKey, weekOptions]);

  const { mutate: logoutFromAccountState, isLoading: isLoggingOut } =
    trpc.auth.logout.useMutation({
      onSuccess: () => {
        queryClient.clear();
        clearRowbookSessionStorage();
        setAccountActionError(null);
        router.replace("/login");
        router.refresh();
      },
      onError: () => {
        setAccountActionError(
          "We couldn't log you out. Check your connection and try again.",
        );
      },
    });

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
    if (!isCoach) {
      router.replace("/athlete");
    }
  }, [isCoach, isSessionLoading, router, session, sessionError]);

  useEffect(() => {
    if (!activeTeamId || requestedTeamId === activeTeamId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("teamId", activeTeamId);
    router.replace(`${pathname}?${params.toString()}`);
  }, [activeTeamId, pathname, requestedTeamId, router, searchParams]);

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

  if (!isCoach) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-sm text-default-500">
        Redirecting to the athlete dashboard...
      </div>
    );
  }

  if (isTeamsLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (teamsError || !activeTeamId || !teams?.length) {
    const loadFailed = Boolean(teamsError);
    return (
      <div className="min-h-dvh bg-background">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-divider/40 bg-content1/80 px-4 py-4 sm:px-8">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-default-500">
              Coach
            </p>
            <p className="font-display text-lg font-semibold text-foreground">
              Rowbook
            </p>
          </div>
          <p className="min-w-0 break-all text-right text-xs text-default-500">
            Signed in as <span className="font-semibold text-foreground">{userName}</span>
          </p>
        </header>
        <main className="mx-auto flex w-full max-w-xl px-4 py-12 sm:px-6 sm:py-20">
          <section
            aria-labelledby="coach-account-state-title"
            className="w-full space-y-5 rounded-2xl border border-divider/40 bg-content1/80 p-5 shadow-card sm:p-7"
          >
            <div className="space-y-2">
              <p className="section-title">Coach account</p>
              <h1
                id="coach-account-state-title"
                className="font-display text-2xl font-semibold text-foreground"
              >
                {loadFailed ? "We couldn't load your teams" : "No team assigned"}
              </h1>
              <p className="text-sm leading-relaxed text-default-600">
                {loadFailed
                  ? "Rowbook couldn't verify your team access. Check your connection and try again."
                  : "Ask a Rowbook administrator to add this coach account to a team, then check again."}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={isTeamsFetching || isLoggingOut}
                onClick={() => {
                  setAccountActionError(null);
                  void refetchTeams();
                }}
              >
                {isTeamsFetching ? "Checking…" : loadFailed ? "Try again" : "Check again"}
              </Button>
              <Button
                variant="ghost"
                className="min-h-11"
                disabled={isLoggingOut || isTeamsFetching}
                onClick={() => {
                  setAccountActionError(null);
                  logoutFromAccountState();
                }}
              >
                {isLoggingOut
                  ? "Logging out…"
                  : accountActionError
                    ? "Try logging out again"
                    : "Log out"}
              </Button>
            </div>

            {accountActionError ? (
              <p role="alert" className="text-sm leading-relaxed text-rose-600">
                {accountActionError}
              </p>
            ) : null}
          </section>
        </main>
      </div>
    );
  }

  const withCoachContext = (href: string) => {
    const params = new URLSearchParams();
    params.set("teamId", activeTeamId);
    if (searchWeekKey) params.set("weekStartAt", searchWeekKey);
    return `${href}?${params.toString()}`;
  };
  const canDiscardUnsavedSettings = () =>
    document.body.dataset.rowbookUnsavedSettings !== "true" ||
    window.confirm("Discard your unsaved weekly setting changes?");

  const navItems: NavItem[] = [
    { href: withCoachContext("/coach"), label: "Overview", icon: Users },
    ...(pathname.startsWith("/coach/athlete/") || athleteId
      ? [
          {
            href: withCoachContext(
              pathname.startsWith("/coach/athlete/")
                ? pathname
                : `/coach/athlete/${athleteId}`,
            ),
            label: "Athlete",
            icon: UserSquare,
          },
        ]
      : []),
    {
      href: withCoachContext("/coach/review"),
      label: "Review",
      icon: ShieldCheck,
    },
    {
      href: withCoachContext("/coach/settings"),
      label: "Settings",
      icon: Settings,
    },
  ];

  return (
    <AppShell
      title="Coach"
      userName={userName}
      navItems={navItems}
      weekOptions={supportsWeekSelection ? weekOptions : undefined}
      activeWeekKey={activeWeekKey}
      onWeekChange={
        supportsWeekSelection
          ? (nextWeekKey) => {
              if (!canDiscardUnsavedSettings()) return;
              const params = new URLSearchParams(searchParams.toString());
              params.set("weekStartAt", nextWeekKey);
              router.push(`${pathname}?${params.toString()}`);
            }
          : undefined
      }
      teamOptions={teams}
      activeTeamId={activeTeamId}
      onTeamChange={(nextTeamId) => {
        if (!canDiscardUnsavedSettings()) return;
        const params = new URLSearchParams(searchParams.toString());
        params.set("teamId", nextTeamId);
        const nextPath = pathname.startsWith("/coach/athlete/")
          ? "/coach"
          : pathname;
        router.push(`${nextPath}?${params.toString()}`);
      }}
    >
      {children}
    </AppShell>
  );
}
