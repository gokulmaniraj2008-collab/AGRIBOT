"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import ComingSoon from "@/components/coming-soon";
import type { RobotStatus, SensorReading } from "@/lib/types";
import { Map, MapPin, Gauge, Battery, Power, ChevronRight } from "lucide-react";
import Link from "next/link";

export default function FieldPage() {
  const supabase = createClient();
  const [latest, setLatest] = useState<SensorReading | null>(null);
  const [status, setStatus] = useState<RobotStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase
        .from("sensor_data")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SensorReading>(),
      supabase
        .from("robot_status")
        .select("*")
        .eq("robot_id", "agribot-01")
        .single<RobotStatus>(),
    ]).then(([{ data: latestRow }, { data: statusRow }]) => {
      if (cancelled) return;
      if (latestRow) setLatest(latestRow);
      if (statusRow) setStatus(statusRow);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const hasGps = latest?.latitude != null && latest?.longitude != null;

  return (
    <DashboardShell title="Field Map" subtitle="agribot-01">
      <>
        <Link
          href="/plants"
          className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <span className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MapPin className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground dark:text-gray-100">
                Plant Locations
              </span>
              <span className="block text-xs text-muted dark:text-gray-400">
                See every saved plant spot and its soil moisture
              </span>
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted dark:text-gray-400" />
        </Link>

        {hasGps ? (
          <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="relative h-52 bg-gradient-to-br from-primary/15 via-primary/5 to-secondary/10">
              <FieldGrid className="absolute inset-0 h-full w-full opacity-70" />
              <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-white shadow-md ring-4 ring-white/60">
                <MapPin className="h-4 w-4" />
              </span>
              <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-foreground shadow-sm">
                {latest!.latitude!.toFixed(4)}, {latest!.longitude!.toFixed(4)}
              </span>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border p-3 text-center dark:divide-gray-800">
              <TelemetryCell icon={Gauge} label="Speed" value={status ? `${status.speed_value}` : "—"} />
              <TelemetryCell
                icon={Battery}
                label="Battery"
                value={latest?.battery_percent != null ? `${latest.battery_percent.toFixed(0)}%` : "—"}
              />
              <TelemetryCell icon={Power} label="Mode" value={status?.mode === "auto" ? "Auto" : "Manual"} />
            </div>
            <p className="border-t border-border px-3 py-2 text-center text-[11px] text-muted dark:border-gray-800 dark:text-gray-400">
              As of{" "}
              {new Date(latest!.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </section>
        ) : (
          <ComingSoon
            icon={Map}
            title="Field map coming soon"
            description="An interactive zone map with soil-health overlays will appear here once GPS is wired into the robot's firmware."
          />
        )}

        <section className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <span className="text-sm font-semibold text-foreground dark:text-gray-100">
            Zone Health (preview)
          </span>
          <p className="mt-1 text-xs text-muted dark:text-gray-400">
            Per-zone health scoring will populate here once the robot has covered the field and
            reported readings per sector — needs a zone/sector table, not yet in the schema.
          </p>
          <div className="mt-3 flex gap-3 text-xs">
            <Legend color="bg-primary" label="Healthy" />
            <Legend color="bg-warning" label="Moderate" />
            <Legend color="bg-danger" label="Poor" />
          </div>
        </section>
      </>
    </DashboardShell>
  );
}

function TelemetryCell({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-2">
      <Icon className="h-3.5 w-3.5 text-primary" />
      <span className="text-xs font-semibold text-foreground dark:text-gray-100">{value}</span>
      <span className="text-[10px] text-muted dark:text-gray-400">{label}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted dark:text-gray-400">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

/** Stylized field-row grid — matches the welcome page's map preview, no map SDK dependency */
function FieldGrid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 200" preserveAspectRatio="none" className={className} aria-hidden="true">
      {Array.from({ length: 10 }).map((_, i) => (
        <line key={`v${i}`} x1={i * 30} y1="0" x2={i * 30} y2="200" stroke="currentColor" strokeOpacity="0.15" className="text-primary" />
      ))}
      {Array.from({ length: 7 }).map((_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 30} x2="300" y2={i * 30} stroke="currentColor" strokeOpacity="0.1" className="text-primary" />
      ))}
    </svg>
  );
          }
