"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type WeeklyTrendChartProps = {
  data: { week: string; minutes: number }[];
};

export const WeeklyTrendChart = ({ data }: WeeklyTrendChartProps) => (
  <div className="h-64 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <XAxis dataKey="week" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            borderColor: "#e2e8f0",
          }}
          formatter={(value: number) => [`${value} min`, "Minutes"]}
        />
        <Line
          type="monotone"
          dataKey="minutes"
          stroke="#2563eb"
          strokeWidth={3}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
);
