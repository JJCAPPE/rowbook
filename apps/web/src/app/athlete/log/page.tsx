import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { LogWorkoutForm } from "@/components/forms/log-workout-form";

export default function AthleteLogPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Log workout"
        subtitle="Upload proof and enter details for this session."
      />

      <Card>
        <LogWorkoutForm />
      </Card>
    </div>
  );
}
