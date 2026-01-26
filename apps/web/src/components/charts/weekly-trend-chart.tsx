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
            backgroundColor: "hsl(var(--heroui-content1))",
            borderColor: "hsl(var(--heroui-default-200))",
            color: "hsl(var(--heroui-foreground))",
          }}
          formatter={(value: number) => [`${value} min`, "Minutes"]}
        />
        <Line
          type="monotone"
          dataKey="minutes"
          stroke="hsl(var(--heroui-primary))"
          strokeWidth={3}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
);
