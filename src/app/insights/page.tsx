import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { SectionHeading, ProgressRing, StatusBadge, IconTile } from "@/components/ui-kit";
import type { RobotStatus, SensorReading } from "@/lib/types";
import {
  Droplets, Thermometer, Battery, Bug, Sparkles, Leaf, FlaskConical, Bot,
} from "lucide-react";

export const dynamic = "force-dynamic";

type Signal = {
  icon: React.ElementType;
  color: string;
  title: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "muted";
};

export default async function InsightsPage() {
  const supabase = await createClient();

  const [{ data: latest }, { data: status }] = await Promise.all([
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
  ]);

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

  // pH
  if (latest?.ph_level != null) {
    const outOfRange = latest.ph_level < 5.5 || latest.ph_level > 7.5;
    signals.push({
      icon: FlaskConical, color: "#a855f7", tone: outOfRange ? "warning" : "success",
      title: outOfRange ? "Soil pH is out of range" : "Soil pH looks good",
      detail: `pH ${latest.ph_level.toFixed(1)} — ${outOfRange ? "ideal range is roughly 5.5–7.5." : "within the ideal range."}`,
    });
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

  // Connectivity
  const isStale = status?.updated_at && Date.now() - new Date(status.updated_at).getTime() > 30_000;
  const online = (status?.online ?? false) && !isStale;
  signals.push({
    icon: Bot, color: online ? "#16a34a" : "#6b7583", tone: online ? "success" : "muted",
    title: online ? "Robot is online" : "Robot is offline",
    detail: online
      ? `Mode: ${status?.mode === "auto" ? "Auto" : "Manual"} — reporting normally.`
      : "No recent heartbeat — check power and connectivity.",
  });

  // Health score — same rule-of-thumb scoring as /recommendations, only
  // counting metrics the robot has actually reported.
  const checks: boolean[] = [];
  if (latest?.soil_moisture != null) checks.push(latest.soil_moisture >= 30 && latest.soil_moisture <= 85);
  if (latest?.temperature != null) checks.push(latest.temperature <= 32);
  if (latest?.ph_level != null) checks.push(latest.ph_level >= 5.5 && latest.ph_level <= 7.5);
  if (latest?.battery_percent != null) checks.push(latest.battery_percent >= 25);
  if (status) checks.push(online);

  const score = checks.length
    ? Math.round((checks.filter(Boolean).length / checks.length) * 100)
    : null;

  const scoreColor = score == null ? "#6b7583" : score >= 80 ? "#16a34a" : score >= 50 ? "#f59e0b" : "#ef4444";
  const scoreLabel = score == null ? "No data yet" : score >= 80 ? "Good" : score >= 50 ? "Needs attention" : "At risk";

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
              {checks.length > 0
                ? `Based on ${checks.length} live metric${checks.length > 1 ? "s" : ""} the robot is currently reporting.`
                : "Waiting on sensor readings to calculate a score."}
            </p>
          </div>
        </section>

        <div className="mt-4">
          <SectionHeading eyebrow="Signals" title="What AI Is Watching" />
          <div className="flex flex-col gap-2.5">
            {signals.map((s, i) => (
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
            {signals.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted dark:border-gray-700 dark:text-gray-400">
                No sensor data reported yet — insights will appear once the robot starts sending readings.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface p-4 text-center dark:border-gray-700 dark:bg-gray-900">
          <Bug className="mx-auto h-5 w-5 text-muted dark:text-gray-500" />
          <p className="mt-1.5 text-xs font-medium text-foreground dark:text-gray-100">
            Pest & disease detection coming soon
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted dark:text-gray-400">
            This card will show real AI plant-image analysis results once the ESP32-CAM feed is
            connected — see the AI Plant Analysis page for image-based checks available today.
          </p>
        </div>
      </>
    </DashboardShell>
  );
}
