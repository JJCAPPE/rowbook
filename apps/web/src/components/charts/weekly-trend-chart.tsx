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
  <div className="w-full">
    <div className="h-64" role="group" aria-label="Weekly minutes and average heart rate">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} accessibilityLayer>
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
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="avgHr"
          yAxisId="avgHr"
          stroke="hsl(var(--heroui-danger))"
          strokeWidth={2}
          dot={{ r: 3 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
    </div>
    <details className="mt-2 text-xs text-default-600">
      <summary className="min-h-11 w-fit cursor-pointer rounded py-3">View weekly data</summary>
      <div tabIndex={0} role="region" aria-label="Weekly workout data" className="overflow-x-auto rounded">
        <table className="w-full whitespace-nowrap text-right tabular-nums">
          <caption className="sr-only">Weekly minutes and average heart rate</caption>
          <thead><tr><th scope="col" className="py-2 pr-4 text-left">Week</th><th scope="col" className="px-3">Minutes</th><th scope="col" className="pl-3">Average HR</th></tr></thead>
          <tbody>{data.map((point) => (
            <tr key={point.week} className="border-t border-divider/40">
              <th scope="row" className="py-2 pr-4 text-left font-medium">{point.week}</th>
              <td className="px-3">{point.minutes}</td>
              <td className="pl-3">{point.avgHr == null ? "No HR data" : `${point.avgHr} bpm`}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </details>
  </div>
);
