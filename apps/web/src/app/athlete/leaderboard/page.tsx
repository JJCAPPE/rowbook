import { PageHeader } from "@/components/layout/page-header";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { Card } from "@/components/ui/card";
import { leaderboardRows } from "@/lib/mock-data";

export default function AthleteLeaderboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly leaderboard"
        subtitle="See how the team stacks up on total minutes."
      />

      <Card>
        <LeaderboardTable rows={leaderboardRows} />
      </Card>
    </div>
  );
}
