"use client";

import { PageHeader } from "@/components/layout/page-header";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function AthleteLeaderboardPage() {
  const { data, isLoading, error } = trpc.athlete.getLeaderboard.useQuery();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly leaderboard"
        subtitle="See how the team stacks up on total minutes."
      />

      <Card>
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading leaderboard...</p>
        ) : error ? (
          <p className="text-sm text-rose-500">Unable to load leaderboard.</p>
        ) : (
          <LeaderboardTable rows={data?.leaderboard ?? []} />
        )}
      </Card>
    </div>
  );
}
