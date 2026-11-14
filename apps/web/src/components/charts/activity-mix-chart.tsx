"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ACTIVITY_TYPE_LABELS, ActivityType } from "@rowbook/shared";

type ActivityMixChartProps = {
  data: { type: ActivityType; minutes: number }[];
};

export const ActivityMixChart = ({ data }: ActivityMixChartProps) => {
  const formatted = data.map((entry) => ({
    ...entry,
    label: ACTIVITY_TYPE_LABELS[entry.type],
  }));

  return (
    <div className="w-full">
      <div className="h-64" role="group" aria-label="Minutes by activity">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formatted} accessibilityLayer>
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              backgroundColor: "hsl(var(--heroui-content1))",
              borderColor: "hsl(var(--heroui-default-200))",
              color: "hsl(var(--heroui-foreground))",
            }}
            formatter={(value) => [`${Number(value ?? 0)} min`, "Minutes"]}
          />
          <Bar dataKey="minutes" fill="hsl(var(--heroui-secondary))" radius={[8, 8, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-default-600">
        <summary className="min-h-11 w-fit cursor-pointer rounded py-3">View activity data</summary>
        <table className="w-full text-right tabular-nums">
          <caption className="sr-only">Minutes by activity</caption>
          <thead><tr><th scope="col" className="py-2 pr-4 text-left">Activity</th><th scope="col">Minutes</th></tr></thead>
          <tbody>{formatted.map((point) => (
            <tr key={point.type} className="border-t border-divider/40">
              <th scope="row" className="py-2 pr-4 text-left font-medium">{point.label}</th>
              <td>{point.minutes}</td>
            </tr>
          ))}</tbody>
        </table>
      </details>
    </div>
  );
};
