"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { SensorPoint } from "@/types/telemetry";

export function SensorChartCard({ data }: { data: SensorPoint[] }) {
  return (
    <div className="bg-white border border-border rounded-card p-5 shadow-card">
      <h3 className="text-base font-semibold mb-1">Soil Moisture & Battery</h3>
      <p className="text-xs text-text-secondary mb-4">Last 6 hours</p>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#E5E7EB" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#6B7280" }}
              axisLine={{ stroke: "#E5E7EB" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6B7280" }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #E5E7EB",
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="soilMoisture"
              name="Soil Moisture %"
              stroke="#16A34A"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="battery"
              name="Battery %"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
