import { Wifi, WifiOff, Loader2, MapPin } from "lucide-react";
import type { RobotTelemetry } from "@/types/telemetry";

const statusConfig = {
  online: { icon: Wifi, label: "ONLINE", classes: "text-success bg-success/10" },
  connecting: { icon: Loader2, label: "CONNECTING", classes: "text-warning bg-warning/10" },
  offline: { icon: WifiOff, label: "OFFLINE", classes: "text-danger bg-danger/10" },
};

export function RobotStatusCard({ telemetry }: { telemetry: RobotTelemetry }) {
  const { icon: Icon, label, classes } = statusConfig[telemetry.connection];

  return (
    <div className="bg-white border border-border rounded-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-secondary">Robot</p>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${classes}`}
        >
          <Icon size={12} className={telemetry.connection === "connecting" ? "animate-spin" : ""} />
          {label}
        </span>
      </div>
      <p className="mt-3 text-lg font-bold font-display text-text-primary">
        {telemetry.robotId}
      </p>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary">
        <MapPin size={13} />
        {telemetry.latitude.toFixed(4)}, {telemetry.longitude.toFixed(4)}
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        Last seen {telemetry.lastSeenSeconds}s ago
      </p>
    </div>
  );
}
