"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { SectionHeading, ProgressRing, StatusBadge, IconTile } from "@/components/ui-kit";
import type { SensorReading } from "@/lib/types";
import {
  Droplets, Thermometer, Battery, Bug, Sparkles, Bot,
} from "lucide-react";

type Signal = {
  icon: React.ElementType;
  color: string;
  title: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "muted";
};

export default function InsightsPage() {
  const supabase = createClient();
  const [latest, setLatest] = useState<SensorReading | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase
        .from("agribot_sensor_data")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SensorReading>(),
    ]).then(([{ data: latestRow }]) => {
      if (cancelled) return;
      if (latestRow) setLatest(latestRow);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const signals: Signal[] = [];

  // Soil moisture
  if (latest?.soil_moisture != null) {
    if (latest.soil_moisture < 30) {
      signals.push({
        icon: Droplets, color: "#0ea5e9", tone: "danger",
        title: "Soil moisture is low",
        detail: `${latest.soil_moisture.toFixed(0)}% — irrigation recommended soon.`,
      });
    } else if (latest.soil_moisture > 85) {
      signals.push({
        icon: Droplets, color: "#0ea5e9", tone: "warning",
        title: "Soil is very saturated",
        detail: `${latest.soil_moisture.toFixed(0)}% — hold off on watering.`,
      });
    } else {
      signals.push({
        icon: Droplets, color: "#0ea5e9", tone: "success",
        title: "Soil moisture is healthy",
        detail: `${latest.soil_moisture.toFixed(0)}% — within the optimal range.`,
      });
    }
  }

  // Temperature
  if (latest?.temperature != null) {
    if (latest.temperature > 32) {
      signals.push({
        icon: Thermometer, color: "#f97316", tone: "warning",
        title: "Elevated temperature",
        detail: `${latest.temperature.toFixed(1)}°C — watch for heat stress on crops.`,
      });
    } else {
      signals.push({
        icon: Thermometer, color: "#f97316", tone: "success",
        title: "Temperature is stable",
        detail: `${latest.temperature.toFixed(1)}°C — in a comfortable range.`,
      });
    }
  }

  // Robot battery / patrol readiness
  if (latest?.battery_percent != null) {
    if (latest.battery_percent < 25) {
      signals.push({
        icon: Battery, color: "#ef4444", tone: "danger",
        title: "Robot battery is low",
        detail: `${latest.battery_percent.toFixed(0)}% — recharge before the next patrol.`,
      });
    } else {
      signals.push({
        icon: Battery, color: "#16a34a", tone: "success",
        title: "Robot is ready to patrol",
        detail: `Battery at ${latest.battery_percent.toFixed(0)}% — sufficient for normal operation.`,
      });
    }
  }

  const demo = !latest;
  const demoSignals: Signal[] = [
    { icon: Droplets, color: "#0ea5e9", tone: "success", title: "Soil moisture is healthy", detail: "42% — sample field reading is within the normal demo range." },
    { icon: Thermometer, color: "#f97316", tone: "warning", title: "Temperature needs monitoring", detail: "32.5°C — sample reading is slightly elevated in this demo." },
    { icon: Battery, color: "#16a34a", tone: "success", title: "Robot battery is ready", detail: "78% — sample battery level is sufficient for normal operation." },
    { icon: Sparkles, color: "#16a34a", tone: "success", title: "Irrigation window detected", detail: "Plant 2 is at 28% soil moisture in the demo field and would be considered for watering." },
  ];
  const displayedSignals = demo ? demoSignals : signals;
  const score = demo ? 84 : null;
  const scoreLabel = demo ? "Demo — Good" : "No data yet";

  return (
    <DashboardShell title="AI Insights" subtitle="Farm-wide summary, generated from live sensor data">
      <>
        <section className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-primary to-emerald-600 p-5 text-white shadow-md">
          <ProgressRing percent={score ?? 0} color="#ffffff" size={76} stroke={7}>
            <span className="text-lg font-bold text-white">
              {score != null ? score : "—"}
            </span>
          </ProgressRing>
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/80">
              <Sparkles className="h-3.5 w-3.5" />
              Farm Health Score
            </p>
            <p className="mt-1 text-base font-semibold">{scoreLabel}</p>
            <p className="mt-0.5 text-xs text-white/80">
              {demo ? "Sample AI analysis for demonstration — not live robot data." : "Waiting on sensor readings to calculate a score."}
            </p>
          </div>
        </section>

        <div className="mt-4">
          <SectionHeading eyebrow="Signals" title="What AI Is Watching" />
          <div className="flex flex-col gap-2.5">
            {displayedSignals.map((s, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-2xl border border-border bg-white p-3.5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
              >
                <IconTile icon={s.icon} color={s.color} size={32} />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground dark:text-gray-100">{s.title}</p>
                    <StatusBadge
                      label={s.tone === "success" ? "OK" : s.tone === "warning" ? "Watch" : s.tone === "danger" ? "Action" : "—"}
                      tone={s.tone}
                    />
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted dark:text-gray-400">{s.detail}</p>
                </div>
              </div>
            ))}
            {!demo && displayedSignals.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted dark:border-gray-700 dark:text-gray-400">
                No sensor data reported yet — insights will appear once the robot starts sending readings.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-900/40 dark:bg-amber-950/20">
          <Bot className="mx-auto h-5 w-5 text-amber-600" />
          <p className="mt-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            DEMO AI ANALYSIS
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
            Sample insights are shown for presentation. Live AI signals will automatically replace these demo details when the robot sends real sensor data.
          </p>
        </div>
      </>
    </DashboardShell>
  );
}
