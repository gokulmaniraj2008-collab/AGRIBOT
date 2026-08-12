"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import type { RobotStatus, SensorReading } from "@/lib/types";
import {
  Droplets,
  Battery,
  Thermometer,
  WifiOff,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";

type Category = "critical" | "warning" | "info";

type Alert = {
  icon: typeof Droplets;
  title: string;
  detail: string;
  time: string;
  category: Category;
};

const CATEGORY_STYLES: Record<Category, { badge: string; bar: string; label: string }> = {
  critical: { badge: "bg-danger/10 text-danger", bar: "bg-danger", label: "Critical" },
  warning: { badge: "bg-warning/10 text-warning", bar: "bg-warning", label: "Warning" },
  info: { badge: "bg-info/10 text-info", bar: "bg-info", label: "Info" },
};

const FILTERS: { id: "all" | Category; label: string }[] = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "warning", label: "Warning" },
  { id: "info", label: "Info" },
];

export default function AlertsPage() {
  const supabase = createClient();
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [latest, setLatest] = useState<SensorReading | null>(null);
  const [filter, setFilter] = useState<"all" | Category>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: statusRow }, { data: latestRow }] = await Promise.all([
        supabase
          .from("robot_status")
          .select("*")
          .eq("robot_id", "agribot-01")
          .single<RobotStatus>(),
        supabase
          .from("sensor_data")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<SensorReading>(),
      ]);
      if (cancelled) return;
      if (statusRow) setStatus(statusRow);
      if (latestRow) setLatest(latestRow);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const time = latest
    ? new Date(latest.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  // Same threshold logic as before — only the presentation below changed.
  const alerts: Alert[] = [];

  if (status && !status.online) {
    alerts.push({
      icon: WifiOff,
      title: "Robot Offline",
      detail: "No connection from agribot-01 — check power and WiFi.",
      time,
      category: "info",
    });
  }

  if (latest?.soil_moisture != null && latest.soil_moisture < 30) {
    alerts.push({
      icon: Droplets,
      title: "Irrigation Needed",
      detail: `Soil moisture is low at ${latest.soil_moisture.toFixed(0)}%.`,
      time,
      category: "info",
    });
  }

  if (latest?.battery_percent != null && latest.battery_percent < 20) {
    alerts.push({
      icon: Battery,
      title: "Low Battery",
      detail: `Battery at ${latest.battery_percent.toFixed(0)}% — consider recharging soon.`,
      time,
      category: "warning",
    });
  }

  if (latest?.temperature != null && latest.temperature > 35) {
    alerts.push({
      icon: Thermometer,
      title: "High Temperature",
      detail: `Temperature crossed ${latest.temperature.toFixed(1)}°C.`,
      time,
      category: "critical",
    });
  }

  if (
    latest?.distance_cm != null &&
    latest.distance_cm < 15 &&
    status?.motor_state !== "stopped"
  ) {
    alerts.push({
      icon: ShieldAlert,
      title: "Obstacle Detected",
      detail: `Object ${latest.distance_cm.toFixed(0)}cm ahead.`,
      time,
      category: "critical",
    });
  }

  const visible = filter === "all" ? alerts : alerts.filter((a) => a.category === filter);
  const counts = {
    critical: alerts.filter((a) => a.category === "critical").length,
    warning: alerts.filter((a) => a.category === "warning").length,
    info: alerts.filter((a) => a.category === "info").length,
  };

  return (
    <DashboardShell title="Alerts" subtitle="Based on the latest reading">
      <>
        <div className="mb-4 grid grid-cols-3 gap-2.5">
          <CountCard label="Critical" count={counts.critical} tone="danger" />
          <CountCard label="Warning" count={counts.warning} tone="warning" />
          <CountCard label="Info" count={counts.info} tone="info" />
        </div>

        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                filter === f.id
                  ? "bg-primary text-white"
                  : "border border-border bg-white text-muted dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center dark:border-gray-700 dark:bg-gray-900">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground dark:text-gray-100">
                {alerts.length === 0 ? "All systems normal" : "No alerts in this category"}
              </p>
              <p className="mt-1 text-xs text-muted dark:text-gray-400">
                {alerts.length === 0
                  ? "No alerts from the latest sensor reading."
                  : "Try a different filter above."}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {visible.map((alert) => {
              const style = CATEGORY_STYLES[alert.category];
              return (
                <div
                  key={alert.title}
                  className="flex items-start gap-3 overflow-hidden rounded-2xl border border-border bg-white p-3.5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
                >
                  <span className={`h-full w-1 shrink-0 self-stretch rounded-full ${style.bar}`} />
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.badge}`}>
                    <alert.icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground dark:text-gray-100">
                        {alert.title}
                      </p>
                      <span className="text-[11px] text-muted dark:text-gray-500">{alert.time}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted dark:text-gray-400">{alert.detail}</p>
                    <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}>
                      {style.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    </DashboardShell>
  );
}

function CountCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "danger" | "warning" | "info";
}) {
  const toneClasses: Record<string, string> = {
    danger: "text-danger",
    warning: "text-warning",
    info: "text-info",
  };
  return (
    <div className="rounded-xl border border-border bg-white p-3 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className={`text-xl font-extrabold ${toneClasses[tone]}`}>{count}</p>
      <p className="mt-0.5 text-[10px] font-medium text-muted dark:text-gray-400">{label}</p>
    </div>
  );
}
