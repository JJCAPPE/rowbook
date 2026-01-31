import { formatDistance } from "@/lib/format";
import { StatTile } from "@/components/ui/stat-tile";

type TeamStatsProps = {
    totalMinutes: number;
    totalDistance: number;
    avgHr: number | null;
};

export function TeamStats({ totalMinutes, totalDistance, avgHr }: TeamStatsProps) {
    return (
        <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
                label="Minutes"
                value={`${totalMinutes.toLocaleString()} min`}
            />
            <StatTile
                label="Distance"
                value={formatDistance(totalDistance)}
            />
            <StatTile
                label="Avg HR"
                value={avgHr ? `${avgHr} bpm` : "—"}
            />
        </div>
    );
}
