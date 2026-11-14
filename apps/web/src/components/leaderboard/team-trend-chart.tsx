"use client";

import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { formatShortDate } from "@/lib/format";

type TeamTrendChartProps = {
    data: {
        weekStartAt: Date | string;
        minutes: number;
        avgHr: number | null;
    }[];
};

export function TeamTrendChart({ data }: TeamTrendChartProps) {
    const chartData = data.map((d) => ({
        ...d,
        formattedDate: formatShortDate(new Date(d.weekStartAt)),
    }));

    return (
        <div className="w-full">
            <div className="h-[300px]" role="group" aria-label="Weekly team minutes and average heart rate">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    accessibilityLayer
                >
                    <defs>
                        <linearGradient id="colorMinutes" x1="0" y1="0" x2="0" y2="1">
                            <stop
                                offset="5%"
                                stopColor="hsl(var(--heroui-primary))"
                                stopOpacity={0.3}
                            />
                            <stop
                                offset="95%"
                                stopColor="hsl(var(--heroui-primary))"
                                stopOpacity={0}
                            />
                        </linearGradient>
                        <linearGradient id="colorAvgHr" x1="0" y1="0" x2="0" y2="1">
                            <stop
                                offset="5%"
                                stopColor="hsl(var(--heroui-danger))"
                                stopOpacity={0.3}
                            />
                            <stop
                                offset="95%"
                                stopColor="hsl(var(--heroui-danger))"
                                stopOpacity={0}
                            />
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="hsl(var(--heroui-divider))"
                    />
                    <XAxis
                        dataKey="formattedDate"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "hsl(var(--heroui-default-500))", fontSize: 12 }}
                        dy={10}
                        minTickGap={30}
                    />
                    <YAxis
                        yAxisId="minutes"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "hsl(var(--heroui-default-500))", fontSize: 12 }}
                        width={60}
                    />
                    <YAxis
                        yAxisId="avgHr"
                        orientation="right"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "hsl(var(--heroui-default-500))", fontSize: 12 }}
                        width={40}
                    />
                    <Tooltip
                        contentStyle={{
                            borderRadius: 12,
                            backgroundColor: "hsl(var(--heroui-content1))",
                            borderColor: "hsl(var(--heroui-divider))",
                            color: "hsl(var(--heroui-foreground))",
                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
                        cursor={{
                            stroke: "hsl(var(--heroui-default-300))",
                            strokeWidth: 1,
                            strokeDasharray: "3 3",
                        }}
                        formatter={(value, name) => {
                            if (name === "minutes") return [`${Number(value).toLocaleString()} min`, "Team Total Min"];
                            if (name === "avgHr") return [`${value} bpm`, "Team Avg HR"];
                            return [value, name];
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="minutes"
                        yAxisId="minutes"
                        stroke="hsl(var(--heroui-primary))"
                        fillOpacity={1}
                        fill="url(#colorMinutes)"
                        strokeWidth={3}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                        isAnimationActive={false}
                    />
                    <Area
                        type="monotone"
                        dataKey="avgHr"
                        yAxisId="avgHr"
                        stroke="hsl(var(--heroui-danger))"
                        fillOpacity={1}
                        fill="url(#colorAvgHr)"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
            </div>
            <details className="mt-2 text-xs text-default-600">
                <summary className="min-h-11 w-fit cursor-pointer rounded py-3">View weekly data</summary>
                <div tabIndex={0} role="region" aria-label="Weekly training data" className="overflow-x-auto rounded">
                    <table className="w-full min-w-[24rem] whitespace-nowrap text-right tabular-nums">
                        <caption className="sr-only">Weekly team minutes and average heart rate</caption>
                        <thead><tr><th scope="col" className="py-2 pr-4 text-left">Week of</th><th scope="col" className="px-3">Team minutes</th><th scope="col" className="pl-3">Average HR</th></tr></thead>
                        <tbody>{chartData.map((point) => (
                            <tr key={new Date(point.weekStartAt).toISOString()} className="border-t border-divider/40">
                                <th scope="row" className="sticky left-0 bg-content1 py-2 pr-4 text-left font-medium">{point.formattedDate}</th>
                                <td className="px-3">{point.minutes.toLocaleString()}</td>
                                <td className="pl-3">{point.avgHr == null ? "No HR data" : `${point.avgHr} bpm`}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            </details>
        </div>
    );
}
