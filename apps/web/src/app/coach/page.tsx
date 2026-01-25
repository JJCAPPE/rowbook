import { PageHeader } from "@/components/layout/page-header";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { coachSummary, leaderboardRows } from "@/lib/mock-data";

export default function CoachOverviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Team overview"
        subtitle={`Weekly requirement: ${coachSummary.requiredMinutes} minutes`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="pending">4 missing proof</Badge>
            <Badge tone="danger">2 missing minutes</Badge>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile label="Met goal" value={`${coachSummary.metCount}`} />
        <StatTile label="Not met" value={`${coachSummary.notMetCount}`} />
        <StatTile label="Exempt" value={`${coachSummary.exemptCount}`} />
      </div>

      <Card>
        <LeaderboardTable rows={leaderboardRows} />
      </Card>
    </div>
  );
}
