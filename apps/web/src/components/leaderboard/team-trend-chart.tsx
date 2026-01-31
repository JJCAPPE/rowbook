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
        <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
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
                    />
                    <Area
                        type="monotone"
                        dataKey="avgHr"
                        yAxisId="avgHr"
                        stroke="hsl(var(--heroui-danger))"
                        fillOpacity={1}
                        fill="url(#colorAvgHr)"
                        strokeWidth={3}
                        connectNulls
                        activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
