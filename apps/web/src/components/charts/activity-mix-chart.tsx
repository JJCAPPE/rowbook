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
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formatted}>
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              borderColor: "#e2e8f0",
            }}
            formatter={(value: number) => [`${value} min`, "Minutes"]}
          />
          <Bar dataKey="minutes" fill="#14b8a6" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
