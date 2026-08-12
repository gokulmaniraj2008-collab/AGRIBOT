"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { SectionHeading, StatusBadge } from "@/components/ui-kit";
import type { SensorReading, RobotCommandRow } from "@/lib/types";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Square, Droplet,
  Power, Gauge, Clock, ListChecks,
} from "lucide-react";

const COMMAND_META: Record<
  string,
  { icon: React.ElementType; label: string; color: string }
> = {
  forward: { icon: ArrowUp, label: "Drive forward", color: "#16a34a" },
  backward: { icon: ArrowDown, label: "Drive backward", color: "#16a34a" },
  left: { icon: ArrowLeft, label: "Turn left", color: "#16a34a" },
  right: { icon: ArrowRight, label: "Turn right", color: "#16a34a" },
  stop: { icon: Square, label: "Stop", color: "#ef4444" },
  pump_on: { icon: Droplet, label: "Water pump on", color: "#0891b2" },
  pump_off: { icon: Droplet, label: "Water pump off", color: "#0891b2" },
  set_speed: { icon: Gauge, label: "Speed changed", color: "#6366f1" },
  set_mode_auto: { icon: Power, label: "Switched to Auto", color: "#0ea5e9" },
  set_mode_manual: { icon: Power, label: "Switched to Manual", color: "#0ea5e9" },
  set_irrigation_auto_on: { icon: Droplet, label: "Auto irrigation on", color: "#0ea5e9" },
  set_irrigation_auto_off: { icon: Droplet, label: "Auto irrigation off", color: "#0ea5e9" },
  set_irrigation_threshold: { icon: Droplet, label: "Irrigation threshold set", color: "#0ea5e9" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function HistoryClient({
  initialReadings,
  initialCommands,
}: {
  initialReadings: SensorReading[];
  initialCommands: RobotCommandRow[];
}) {
  const [readings] = useState<SensorReading[]>(initialReadings);
  const [commands] = useState<RobotCommandRow[]>(initialCommands);

  const chronological = [...readings].reverse();
  const chartData = chronological.map((r) => ({
    time: new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    battery: r.battery_percent,
    soil: r.soil_moisture,
  }));

  // Command activity counted from real robot_commands rows — no fabricated
  // "distance travelled" or "operating hours" since the schema doesn't
  // track an odometer or uptime clock.
  const counts = commands.reduce<Record<string, number>>((acc, c) => {
    acc[c.command] = (acc[c.command] ?? 0) + 1;
    return acc;
  }, {});
  const topCommands = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCount = topCommands[0]?.[1] ?? 1;

  return (
    <DashboardShell title="Robot History" subtitle="Last 30 commands · 50 readings">
      <>
        <SectionHeading eyebrow="Trends" title="Battery & Soil Moisture" />
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {chartData.length > 1 ? (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6ebe8" />
                  <XAxis dataKey="time" stroke="#6b7583" fontSize={10} tickLine={false} />
                  <YAxis stroke="#6b7583" fontSize={10} tickLine={false} width={30} />
                  <Tooltip
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #e6ebe8",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="battery" name="Battery %" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="soil" name="Soil %" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-10 text-center text-xs text-muted dark:text-gray-400">
              Not enough readings yet to chart a trend.
            </p>
          )}
        </div>

        <div className="mt-4">
          <SectionHeading eyebrow="Activity" title="Command Frequency" />
          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            {topCommands.length === 0 ? (
              <p className="text-center text-xs text-muted dark:text-gray-400">
                No commands sent yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {topCommands.map(([cmd, count]) => {
                  const meta = COMMAND_META[cmd] ?? { icon: ListChecks, label: cmd, color: "#6b7583" };
                  const Icon = meta.icon;
                  return (
                    <div key={cmd} className="flex items-center gap-2.5">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="w-28 shrink-0 text-xs text-foreground dark:text-gray-200">
                        {meta.label}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(count / maxCount) * 100}%`,
                            backgroundColor: meta.color,
                          }}
                        />
                      </div>
                      <span className="w-5 shrink-0 text-right text-xs font-semibold text-foreground dark:text-gray-100">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <SectionHeading eyebrow="Log" title="Recent Commands" />
          <div className="divide-y divide-border rounded-2xl border border-border bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
            {commands.length === 0 && (
              <p className="p-4 text-center text-xs text-muted dark:text-gray-400">
                No commands recorded yet.
              </p>
            )}
            {commands.map((c) => {
              const meta = COMMAND_META[c.command] ?? { icon: ListChecks, label: c.command, color: "#6b7583" };
              const Icon = meta.icon;
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground dark:text-gray-100">
                      {meta.label}
                      {c.value != null && <span className="text-muted dark:text-gray-400"> · {c.value}</span>}
                    </p>
                    <p className="flex items-center gap-1 text-[11px] text-muted dark:text-gray-400">
                      <Clock className="h-3 w-3" />
                      {timeAgo(c.created_at)}
                    </p>
                  </div>
                  <StatusBadge
                    label={c.executed ? "Executed" : "Pending"}
                    tone={c.executed ? "success" : "muted"}
                    dot={false}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </>
    </DashboardShell>
  );
}
