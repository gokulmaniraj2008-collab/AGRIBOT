"use client";

import { useState } from "react";
import type { SensorReading } from "@/lib/types";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatusBadge } from "@/components/ui-kit";
import {
  Droplets, Thermometer, Wind, Battery, Radar, MapPin,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

type Tab = "all" | "soil" | "climate" | "robot";
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "soil", label: "Soil" },
  { id: "climate", label: "Climate" },
  { id: "robot", label: "Robot" },
];

type Metric = {
  key: keyof SensorReading;
  label: string;
  unit: string;
  icon: React.ElementType;
  color: string;
  group: Exclude<Tab, "all">;
  /** Simple, visible thresholds — not hidden magic, so the badge always matches the number shown */
  status: (v: number) => { label: string; tone: "success" | "warning" | "danger" };
};

const METRICS: Metric[] = [
  {
    key: "soil_moisture", label: "Soil Moisture", unit: "%", icon: Droplets, color: "#0ea5e9", group: "soil",
    status: (v) => (v < 30 ? { label: "Low", tone: "danger" } : v > 80 ? { label: "High", tone: "warning" } : { label: "Optimal", tone: "success" }),
  },
  {
    key: "temperature", label: "Temperature", unit: "°C", icon: Thermometer, color: "#f97316", group: "climate",
    status: (v) => (v > 35 ? { label: "High", tone: "danger" } : v > 32 ? { label: "Warm", tone: "warning" } : { label: "Normal", tone: "success" }),
  },
  {
    key: "humidity", label: "Humidity", unit: "%", icon: Wind, color: "#6366f1", group: "climate",
    status: (v) => (v < 30 ? { label: "Low", tone: "warning" } : { label: "Normal", tone: "success" }),
  },
  {
    key: "battery_percent", label: "Battery", unit: "%", icon: Battery, color: "#16a34a", group: "robot",
    status: (v) => (v < 20 ? { label: "Low", tone: "danger" } : { label: "Good", tone: "success" }),
  },
  {
    key: "distance_cm", label: "Ultrasonic", unit: " cm", icon: Radar, color: "#a855f7", group: "robot",
    status: (v) => (v < 15 ? { label: "Obstacle", tone: "warning" } : { label: "Clear", tone: "success" }),
  },
];

export default function MonitoringClient({ readings }: { readings: SensorReading[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const chronological = [...readings].reverse();
  const latest = readings[0];
  const hasGps = latest?.latitude != null && latest?.longitude != null;

  const lastUpdated = latest?.created_at
    ? new Date(latest.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  const visible = METRICS.filter((m) => tab === "all" || m.group === tab);

  return (
    <DashboardShell title="Monitoring" subtitle="agribot-01 — live sensors">
      <>
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                tab === t.id
                  ? "bg-primary text-white"
                  : "bg-white text-muted border border-border dark:bg-gray-900 dark:text-gray-400 dark:border-gray-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {readings.length < 2 ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border bg-surface text-xs text-muted">
            Not enough data yet — waiting on the robot.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((m) => {
              const raw = latest?.[m.key];
              const value = typeof raw === "number" ? raw : null;
              const badge = value != null ? m.status(value) : { label: "No data", tone: "muted" as const };
              const chartData = chronological.map((r) => ({
                time: new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                v: r[m.key] as number | null,
              }));
              return (
                <section
                  key={m.key}
                  className="rounded-2xl border border-border bg-white p-3.5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${m.color}1a`, color: m.color }}
                      >
                        <m.icon className="h-4 w-4" />
                      </span>
                      <span>
                        <p className="text-sm font-semibold text-foreground dark:text-gray-100">{m.label}</p>
                        <p className="text-xs text-muted dark:text-gray-400">
                          {value != null ? `${value.toFixed(1)}${m.unit}` : "—"}
                        </p>
                      </span>
                    </span>
                    <StatusBadge label={badge.label} tone={badge.tone} />
                  </div>
                  <div className="mt-2 h-16 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e6ebe8" />
                        <XAxis dataKey="time" hide />
                        <YAxis hide domain={["auto", "auto"]} />
                        <Tooltip
                          contentStyle={{ background: "#ffffff", border: "1px solid #e6ebe8", borderRadius: 8, fontSize: 11 }}
                        />
                        <Line type="monotone" dataKey="v" stroke={m.color} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {lastUpdated && (
                    <p className="mt-1 text-right text-[10px] text-muted dark:text-gray-500">
                      Updated {lastUpdated}
                    </p>
                  )}
                </section>
              );
            })}

            {(tab === "all" || tab === "robot") && (
              <section className="rounded-2xl border border-border bg-white p-3.5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <span>
                      <p className="text-sm font-semibold text-foreground dark:text-gray-100">GPS Position</p>
                      <p className="text-xs text-muted dark:text-gray-400">
                        {hasGps ? `${latest!.latitude!.toFixed(4)}, ${latest!.longitude!.toFixed(4)}` : "No signal"}
                      </p>
                    </span>
                  </span>
                  <StatusBadge label={hasGps ? "Connected" : "No signal"} tone={hasGps ? "success" : "muted"} />
                </div>
              </section>
            )}
          </div>
        )}
      </>
    </DashboardShell>
  );
}
