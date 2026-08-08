export type ConnectionStatus = "online" | "connecting" | "offline";

export interface RobotTelemetry {
  robotId: string;
  connection: ConnectionStatus;
  lastSeenSeconds: number;
  farmHealthPct: number;
  soilMoisturePct: number;
  batteryPct: number;
  irrigationMode: "AUTO" | "MANUAL";
  latitude: number;
  longitude: number;
}

export interface SensorPoint {
  label: string;
  soilMoisture: number;
  battery: number;
}

export type AlertLevel = "critical" | "warning" | "info";

export interface AlertItem {
  id: string;
  level: AlertLevel;
  title: string;
  timeAgo: string;
}

export interface AIInsight {
  plantHealthPct: number;
  diseaseRisk: "Low" | "Moderate" | "High";
  waterStress: "Low" | "Moderate" | "High";
  growthCondition: string;
  summary: string;
}
