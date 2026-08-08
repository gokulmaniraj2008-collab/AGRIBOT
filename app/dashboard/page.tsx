import { Droplet, HeartPulse, BatteryMedium } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DemoBadge } from "@/components/dashboard/DemoBadge";
import { StatCard } from "@/components/dashboard/StatCard";
import { RobotStatusCard } from "@/components/dashboard/RobotStatusCard";
import { AlertsCard } from "@/components/dashboard/AlertsCard";
import { AIInsightCard } from "@/components/dashboard/AIInsightCard";
import { SensorChartCard } from "@/components/dashboard/SensorChartCard";
import { FarmMapPreviewCard } from "@/components/dashboard/FarmMapPreviewCard";
import {
  getDemoTelemetry,
  getDemoSensorHistory,
  getDemoAlerts,
  getDemoAIInsight,
} from "@/lib/demo-data";

// No robot/Supabase connection exists in this build, so this page reads
// entirely from lib/demo-data.ts. See that file's header comment for how
// to swap in a real Supabase Realtime subscription later.
export default function DashboardPage() {
  const telemetry = getDemoTelemetry();
  const sensorHistory = getDemoSensorHistory();
  const alerts = getDemoAlerts();
  const insight = getDemoAIInsight();

  return (
    <AppShell>
      <div className="px-5 lg:px-8 py-6 lg:py-8 max-w-7xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl">Good morning, Farmer</h1>
            <p className="mt-1 text-sm text-text-secondary">
              {telemetry.robotId} · Last update {telemetry.lastSeenSeconds}s ago
            </p>
          </div>
          <DemoBadge />
        </div>

        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Farm Health"
            value={`${telemetry.farmHealthPct}%`}
            icon={HeartPulse}
            tone="success"
          />
          <StatCard
            label="Soil Moisture"
            value={`${telemetry.soilMoisturePct}%`}
            icon={Droplet}
            tone="default"
          />
          <StatCard
            label="Battery"
            value={`${telemetry.batteryPct}%`}
            icon={BatteryMedium}
            tone={telemetry.batteryPct < 20 ? "danger" : "default"}
          />
          <RobotStatusCard telemetry={telemetry} />
        </div>

        <div className="mt-4 grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <SensorChartCard data={sensorHistory} />
            <AIInsightCard insight={insight} />
          </div>
          <div className="space-y-4">
            <FarmMapPreviewCard />
            <AlertsCard alerts={alerts} />
          </div>
        </div>
      </div>
    </AppShell>
  );
          }
