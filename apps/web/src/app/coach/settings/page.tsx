import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatWeekRange } from "@/lib/format";
import { weeklySettings } from "@/lib/mock-data";

export default function CoachSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly settings"
        subtitle={`Week of ${formatWeekRange(weeklySettings.weekStart, weeklySettings.weekEnd)}`}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="space-y-4">
          <div>
            <p className="section-title">Required minutes</p>
            <p className="text-sm text-slate-500">Applies to all active athletes.</p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="requiredMinutes">Minutes</Label>
              <Input id="requiredMinutes" type="number" defaultValue={weeklySettings.requiredMinutes} />
            </div>
            <Button type="button">Save requirement</Button>
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="section-title">Week boundary</p>
            <p className="text-sm text-slate-500">Sunday at 6:00 PM ET.</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
            Entries after 6:00 PM roll into the next week and proof images are kept for
            7 days after the cutoff.
          </div>
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-title">Exemptions</p>
            <p className="text-sm text-slate-500">Athletes excluded from weekly totals.</p>
          </div>
          <Button variant="outline" size="sm" type="button">
            Add exemption
          </Button>
        </div>
        <div className="grid gap-3">
          {weeklySettings.exemptions.map((exemption) => (
            <div
              key={exemption.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-ink">{exemption.athlete}</p>
                <p className="text-xs text-slate-500">{exemption.reason}</p>
              </div>
              <Button variant="ghost" size="sm" type="button">
                Remove
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
