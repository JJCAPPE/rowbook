"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type MiniTrendChartProps = {
  data: { week: string; minutes: number }[];
};

export const MiniTrendChart = ({ data }: MiniTrendChartProps) => (
  <div className="h-40 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <XAxis dataKey="week" tickLine={false} axisLine={false} hide />
        <YAxis tickLine={false} axisLine={false} hide />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            borderColor: "#e2e8f0",
          }}
          formatter={(value: number) => [`${value} min`, "Minutes"]}
          labelFormatter={(label) => `Week of ${label}`}
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
