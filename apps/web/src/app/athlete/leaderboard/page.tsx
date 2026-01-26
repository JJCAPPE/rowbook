"use client";

import { PageHeader } from "@/components/layout/page-header";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

export default function AthleteLeaderboardPage() {
  const searchParams = useSearchParams();
  const weekStartParam = searchParams.get("weekStartAt");
  const weekStartAt = useMemo(() => {
    if (!weekStartParam) {
      return undefined;
    }
    const parsed = new Date(weekStartParam);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }, [weekStartParam]);

  const { data, isLoading, error } = trpc.athlete.getLeaderboard.useQuery(
    weekStartAt ? { weekStartAt } : undefined,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly leaderboard"
        subtitle="See how the team stacks up on total minutes."
      />

      <Card>
        {isLoading ? (
          <p className="text-sm text-default-500">Loading leaderboard...</p>
        ) : error ? (
          <p className="text-sm text-rose-500">Unable to load leaderboard.</p>
        ) : (
          <LeaderboardTable rows={data?.leaderboard ?? []} />
        )}
      </Card>
    </div>
  );
}
