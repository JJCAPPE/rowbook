"use client";

import { PageHeader } from "@/components/layout/page-header";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { trpc } from "@/lib/trpc";

export default function CoachOverviewPage() {
  const { data, isLoading, error } = trpc.coach.getTeamOverview.useQuery();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team overview"
        subtitle={
          data?.requiredMinutes
            ? `Weekly requirement: ${data.requiredMinutes} minutes`
            : "Set a weekly requirement to track compliance."
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="pending">{data?.pendingProofCount ?? 0} missing proof</Badge>
            <Badge tone="danger">{data?.missingMinutesCount ?? 0} missing minutes</Badge>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile label="Met goal" value={`${data?.summary.met ?? 0}`} />
        <StatTile label="Not met" value={`${data?.summary.notMet ?? 0}`} />
        <StatTile label="Exempt" value={`${data?.summary.exempt ?? 0}`} />
      </div>

      <Card>
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading leaderboard...</p>
        ) : error ? (
          <p className="text-sm text-rose-500">Unable to load team overview.</p>
        ) : (
          <LeaderboardTable rows={data?.leaderboard ?? []} />
        )}
      </Card>
    </div>
  );
}
