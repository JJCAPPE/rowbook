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
            backgroundColor: "hsl(var(--heroui-content1))",
            borderColor: "hsl(var(--heroui-default-200))",
            color: "hsl(var(--heroui-foreground))",
          }}
          formatter={(value: number) => [`${value} min`, "Minutes"]}
          labelFormatter={(label) => `Week of ${label}`}
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
