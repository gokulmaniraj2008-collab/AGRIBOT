import type {
  RobotTelemetry,
  SensorPoint,
  AlertItem,
  AIInsight,
} from "@/types/telemetry";

// DEMO-MODE DATA SERVICE
//
// No robot, Supabase project, or AI backend is connected in this build.
// Every function here returns simulated values only, and every consumer
// of this module must surface a visible "DEMO DATA" / "DEMO AI ANALYSIS"
// label per the spec's Reality Rule. Nothing here should ever be
// presented to a user as live telemetry.
//
// Swap this module for a real Supabase Realtime subscription + AI service
// call when those are connected — the shapes in types/telemetry.ts are
// designed to match the spec's realtime payload so the swap doesn't
// require changing consumers.

function jitter(base: number, range: number) {
  return Math.round(base + (Math.random() - 0.5) * range);
}

export function getDemoTelemetry(): RobotTelemetry {
  return {
    robotId: "AGRIBOT-001",
    connection: "online",
    lastSeenSeconds: jitter(12, 8),
    farmHealthPct: jitter(87, 4),
    soilMoisturePct: jitter(64, 6),
    batteryPct: jitter(82, 3),
    irrigationMode: "AUTO",
    latitude: 11.0168,
    longitude: 76.9558,
  };
}

export function getDemoSensorHistory(): SensorPoint[] {
  const labels = ["6h ago", "5h ago", "4h ago", "3h ago", "2h ago", "1h ago", "Now"];
  let moisture = 58;
  let battery = 91;
  return labels.map((label) => {
    moisture = Math.max(40, Math.min(75, moisture + jitter(0, 6)));
    battery = Math.max(70, battery - Math.random() * 2);
    return { label, soilMoisture: moisture, battery: Math.round(battery) };
  });
}

export function getDemoAlerts(): AlertItem[] {
  return [
    { id: "1", level: "warning", title: "Soil moisture below threshold — Zone B", timeAgo: "12m ago" },
    { id: "2", level: "info", title: "Irrigation cycle completed — Zone A", timeAgo: "1h ago" },
    { id: "3", level: "critical", title: "Obstacle detected on patrol route", timeAgo: "3h ago" },
  ];
}

export function getDemoAIInsight(): AIInsight {
  return {
    plantHealthPct: 92,
    diseaseRisk: "Low",
    waterStress: "Moderate",
    growthCondition: "Healthy",
    summary:
      "Overall crop health is good. Soil moisture is slightly below the configured threshold. Consider irrigation during the next monitoring cycle.",
  };
}
