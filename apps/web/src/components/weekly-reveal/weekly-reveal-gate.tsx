"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { WeeklyRevealExperience } from "@/components/weekly-reveal/weekly-reveal-experience";
import { trpc } from "@/lib/trpc";
import type { WeeklyReveal } from "@/lib/weekly-reveal";

type WeeklyRevealGateProps = {
  children: ReactNode;
  userId: string;
  teamId?: string;
};

export const WeeklyRevealGate = ({ userId, ...props }: WeeklyRevealGateProps) => (
  <WeeklyRevealSession key={`${userId}:${props.teamId ?? "athlete"}`} {...props} />
);

const WeeklyRevealSession = ({
  children,
  teamId,
}: Omit<WeeklyRevealGateProps, "userId">) => {
  const utils = trpc.useUtils();
  const [recap, setRecap] = useState<WeeklyReveal | null>(null);
  const [checked, setChecked] = useState(false);
  const completedWeek = useRef<string | null>(null);
  const mounted = useRef(true);
  const input = teamId ? { teamId } : undefined;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const pending = trpc.weeklyReveal.getPending.useQuery(input, {
    enabled: !recap,
    staleTime: 0,
    cacheTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: 1,
    onSuccess: (nextRecap) => {
      if (!mounted.current) return;
      setChecked(true);
      if (nextRecap && nextRecap.weekStartAt.toISOString() !== completedWeek.current) {
        setRecap((current) => current ?? nextRecap);
      }
    },
  });
  const complete = trpc.weeklyReveal.complete.useMutation({
    onSuccess: async (_, saved) => {
      if (!mounted.current) return;
      completedWeek.current = saved.weekStartAt.toISOString();
      await utils.weeklyReveal.getPending.cancel(input);
      if (!mounted.current) return;
      utils.weeklyReveal.getPending.setData(input, null);
      setRecap(null);
      void utils.weeklyReveal.getPending.invalidate(input);
    },
    onError: (error) => {
      if (!mounted.current || error.data?.code !== "BAD_REQUEST") return;
      setChecked(false);
      setRecap(null);
      void pending.refetch();
    },
  });
  const blocked = !checked || pending.isError;

  return (
    <>
      <div inert={Boolean(recap) || blocked}>
        {children}
      </div>
      {recap ? (
        <WeeklyRevealExperience
          key={`${recap.teamId}:${recap.weekStartAt.toISOString()}`}
          recap={recap}
          saving={complete.isLoading}
          error={
            complete.error && complete.variables?.weekStartAt.getTime() === recap.weekStartAt.getTime()
              ? "We couldn't save your recap. Check your connection and try again."
              : null
          }
          onComplete={() => {
            if (complete.isLoading) return;
            complete.mutate({ teamId: recap.teamId, weekStartAt: recap.weekStartAt });
          }}
        />
      ) : blocked ? (
        <section
          role={pending.isError ? "alertdialog" : "status"}
          aria-modal={pending.isError ? true : undefined}
          aria-labelledby="weekly-reveal-status"
          className="fixed inset-0 z-[100] flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center"
        >
          <h2 id="weekly-reveal-status" className="font-display text-xl font-semibold text-foreground">
            {pending.isError ? "We couldn't load your weekly recap" : "Checking your weekly recap..."}
          </h2>
          {pending.isError ? (
            <Button disabled={pending.isFetching} onClick={() => void pending.refetch()} autoFocus>
              {pending.isFetching ? "Checking..." : "Try again"}
            </Button>
          ) : null}
        </section>
      ) : null}
    </>
  );
};
