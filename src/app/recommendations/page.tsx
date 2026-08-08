import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { SectionHeading, ProgressRing, StatusBadge } from "@/components/ui-kit";
import PlantAnalysis from "./plant-analysis";
import type { SensorReading } from "@/lib/types";
import { Droplets, Battery, Thermometer, Leaf, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

type Tip = {
  icon: typeof Droplets;
  title: string;
  detail: string;
};

export default async function RecommendationsPage() {
  const supabase = await createClient();

  const { data: latest } = await supabase
    .from("sensor_data")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<SensorReading>();

  const tips: Tip[] = [];

  if (latest?.soil_moisture != null) {
    if (latest.soil_moisture < 35) {
      tips.push({
        icon: Droplets,
        title: "Irrigate soon",
        detail: `Soil moisture is ${latest.soil_moisture.toFixed(0)}% — below the optimal range for most crops.`,
      });
    } else if (latest.soil_moisture > 80) {
      tips.push({
        icon: Droplets,
        title: "Hold off on watering",
        detail: `Soil moisture is ${latest.soil_moisture.toFixed(0)}% — already well saturated.`,
      });
    }
  }

  if (latest?.temperature != null && latest.temperature > 32) {
    tips.push({
      icon: Thermometer,
      title: "Monitor for heat stress",
      detail: `Temperature is ${latest.temperature.toFixed(1)}°C — keep an eye on wilting.`,
    });
  }

  if (latest?.battery_percent != null && latest.battery_percent < 30) {
    tips.push({
      icon: Battery,
      title: "Schedule a recharge",
      detail: `Battery is at ${latest.battery_percent.toFixed(0)}% — plan the next charging cycle.`,
    });
  }

  if (tips.length === 0) {
    tips.push({
      icon: Leaf,
      title: "Conditions look good",
      detail: "Readings are within normal range — no action needed right now.",
    });
  }

  // Health score: percentage of available metrics currently in a healthy
  // range. Only metrics the robot has actually reported are counted, so a
  // missing sensor never drags the score down — it's just excluded.
  const checks: { inRange: boolean }[] = [];
  if (latest?.soil_moisture != null) {
    checks.push({ inRange: latest.soil_moisture >= 35 && latest.soil_moisture <= 80 });
  }
  if (latest?.temperature != null) {
    checks.push({ inRange: latest.temperature <= 32 });
  }
  if (latest?.battery_percent != null) {
    checks.push({ inRange: latest.battery_percent >= 30 });
  }
  const healthScore =
    checks.length > 0
      ? Math.round((checks.filter((c) => c.inRange).length / checks.length) * 100)
      : null;

  return (
    <DashboardShell title="Recommendations" subtitle="AI image analysis + live sensor rules">
      <>
        {healthScore != null && (
          <div className="mb-5 flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
            <ProgressRing
              percent={healthScore}
              color={healthScore >= 70 ? "#16a34a" : healthScore >= 40 ? "#f59e0b" : "#ef4444"}
              size={72}
              stroke={7}
            >
              <span className="text-base font-bold text-foreground">{healthScore}</span>
            </ProgressRing>
            <div className="flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Farm Health Score
              </span>
              <p className="mt-0.5 text-xs text-muted">
                Based on {checks.length} live metric{checks.length === 1 ? "" : "s"} currently in range
              </p>
            </div>
            <StatusBadge
              label={healthScore >= 70 ? "Good" : healthScore >= 40 ? "Fair" : "Needs attention"}
              tone={healthScore >= 70 ? "success" : healthScore >= 40 ? "warning" : "danger"}
            />
          </div>
        )}

        <PlantAnalysis />

        <div className="mt-5">
          <SectionHeading eyebrow="Rule-Based" title="Sensor Recommendations" />
        </div>
        <div className="flex flex-col gap-3">
          {tips.map((tip) => (
            <div
              key={tip.title}
              className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <tip.icon className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {tip.title}
                </p>
                <p className="mt-0.5 text-xs text-muted">{tip.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          Sensor rules trigger automatically from live readings — no AI call needed for these.
        </p>
      </>
    </DashboardShell>
  );
}
