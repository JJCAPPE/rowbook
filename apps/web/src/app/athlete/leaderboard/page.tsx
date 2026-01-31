"use client";

import { PageHeader } from "@/components/layout/page-header";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { TeamStats } from "@/components/leaderboard/team-stats";
import { TeamTrendChart } from "@/components/leaderboard/team-trend-chart";
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

      {data && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <TeamStats
            totalMinutes={data.teamStats.totalMinutes}
            totalDistance={data.teamStats.totalDistance}
            avgHr={data.teamStats.avgHr}
          />
          <Card className="p-6">
            <p className="section-title mb-4">Team Progress (Last 6 Weeks)</p>
            <TeamTrendChart data={data.teamTrend} />
          </Card>
        </div>
      )}

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
