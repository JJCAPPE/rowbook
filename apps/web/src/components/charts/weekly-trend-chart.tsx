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
  data: { week: string; minutes: number; avgHr?: number | null }[];
};

export const WeeklyTrendChart = ({ data }: WeeklyTrendChartProps) => (
  <div className="h-64 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <XAxis dataKey="week" tickLine={false} axisLine={false} />
        <YAxis yAxisId="minutes" tickLine={false} axisLine={false} />
        <YAxis yAxisId="avgHr" orientation="right" tickLine={false} axisLine={false} hide />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            backgroundColor: "hsl(var(--heroui-content1))",
            borderColor: "hsl(var(--heroui-default-200))",
            color: "hsl(var(--heroui-foreground))",
          }}
          formatter={(value, _name, item) => {
            const numericValue = typeof value === "number" ? value : Number(value);
            if (item?.dataKey === "avgHr") {
              return [`${numericValue} bpm`, "Avg HR"];
            }
            return [`${numericValue} min`, "Minutes"];
          }}
        />
        <Line
          type="monotone"
          dataKey="minutes"
          yAxisId="minutes"
          stroke="hsl(var(--heroui-primary))"
          strokeWidth={3}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="avgHr"
          yAxisId="avgHr"
          stroke="hsl(var(--heroui-danger))"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
);
