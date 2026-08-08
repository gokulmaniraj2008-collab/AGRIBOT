"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RobotStatus, SensorReading } from "@/lib/types";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatusBadge, ProgressRing } from "@/components/ui-kit";
import { Droplet, Waves, Sprout } from "lucide-react";

export default function IrrigationClient({
  initialStatus,
  initialLatest,
}: {
  initialStatus: RobotStatus | null;
  initialLatest: SensorReading | null;
}) {
  const supabase = createClient();
  const [status, setStatus] = useState<RobotStatus | null>(initialStatus);
  const [latest, setLatest] = useState<SensorReading | null>(initialLatest);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    const statusChannel = supabase
      .channel("robot_status_irrigation_page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "robot_status", filter: "robot_id=eq.agribot-01" },
        (payload) => setStatus(payload.new as RobotStatus)
      )
      .subscribe();
    const sensorChannel = supabase
      .channel("sensor_data_irrigation_page")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensor_data" },
        (payload) => setLatest(payload.new as SensorReading)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(statusChannel);
      supabase.removeChannel(sensorChannel);
    };
  }, [supabase]);

  const sendCommand = useCallback(async (command: string, value?: number) => {
    setSending(command);
    try {
      await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, value }),
      });
    } finally {
      setSending(null);
    }
  }, []);

  const moisture = latest?.soil_moisture ?? null;
  const threshold = status?.irrigation_threshold ?? null;
  const belowThreshold = moisture != null && threshold != null && moisture < threshold;

  return (
    <DashboardShell title="Smart Irrigation" subtitle="agribot-01">
      <>
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground dark:text-gray-100">
            <Waves className="h-4 w-4 text-primary" />
            Water System
          </span>
          <StatusBadge label={status?.pump_status ? "Running" : "Ready"} tone={status?.pump_status ? "info" : "success"} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <ProgressRing percent={latest?.water_tank_percent ?? 0} color="#0ea5e9" size={76} stroke={7}>
              <span className="text-sm font-bold text-foreground dark:text-gray-100">
                {latest?.water_tank_percent != null ? `${latest.water_tank_percent.toFixed(0)}%` : "—"}
              </span>
            </ProgressRing>
            <p className="mt-2 text-xs font-medium text-muted dark:text-gray-400">Water Tank</p>
          </div>
          <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-white p-4 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <Droplet className={`h-7 w-7 ${status?.pump_status ? "text-info" : "text-muted"}`} />
            <p className="text-sm font-bold text-foreground dark:text-gray-100">
              Pump {status?.pump_status ? "ON" : "OFF"}
            </p>
            <p className="text-[11px] text-muted dark:text-gray-400">Manual override below</p>
          </div>
        </div>

        <section className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground dark:text-gray-100">
              <Sprout className="h-4 w-4 text-primary" />
              Field Soil Moisture
            </span>
            <span className="text-sm font-bold text-foreground dark:text-gray-100">
              {moisture != null ? `${moisture.toFixed(0)}%` : "—"}
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.max(0, Math.min(100, moisture ?? 0))}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted dark:text-gray-400">
            Auto-irrigation threshold: {threshold ?? "—"}%
            {belowThreshold && " — below threshold, robot will irrigate if Auto is on."}
          </p>
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground dark:text-gray-100">Mode</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() =>
                sendCommand(status?.irrigation_auto ? "set_irrigation_auto_off" : "set_irrigation_auto_on")
              }
              disabled={sending === "set_irrigation_auto_on" || sending === "set_irrigation_auto_off"}
              className={`rounded-xl py-2.5 text-sm font-medium shadow-sm transition ${
                status?.irrigation_auto
                  ? "bg-primary text-white"
                  : "bg-surface text-muted dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              Auto
            </button>
            <button
              onClick={() =>
                sendCommand(status?.irrigation_auto ? "set_irrigation_auto_off" : "set_irrigation_auto_on")
              }
              disabled={sending === "set_irrigation_auto_on" || sending === "set_irrigation_auto_off"}
              className={`rounded-xl py-2.5 text-sm font-medium shadow-sm transition ${
                !status?.irrigation_auto
                  ? "bg-primary text-white"
                  : "bg-surface text-muted dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              Manual
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => sendCommand("pump_on")}
              disabled={sending === "pump_on" || status?.pump_status}
              className="rounded-xl bg-primary py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primaryDark active:scale-[0.98] disabled:opacity-50"
            >
              Start Irrigation
            </button>
            <button
              onClick={() => sendCommand("pump_off")}
              disabled={sending === "pump_off" || !status?.pump_status}
              className="rounded-xl border border-danger/30 bg-white py-3 text-sm font-semibold text-danger shadow-sm transition hover:bg-danger/5 active:scale-[0.98] disabled:opacity-50 dark:bg-gray-900"
            >
              Stop Irrigation
            </button>
          </div>
        </section>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted dark:text-gray-500">
          This build covers the whole field as one zone — per-zone irrigation (Zone A–D style)
          would need a zones table and per-zone valves, which agribot-01 doesn't have yet.
        </p>
      </>
    </DashboardShell>
  );
}
