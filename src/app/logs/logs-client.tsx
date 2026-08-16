"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, StatusBadge } from "@/components/ui-kit";
import type { RobotLog } from "@/lib/types";
import {
  Navigation, Radar, Camera, Compass, Droplets, MapPin, ListTree,
} from "lucide-react";

const EVENT_META: Record<
  string,
  { icon: React.ElementType; color: string; tone: "success" | "warning" | "danger" | "muted" | "info" }
> = {
  ROBOT: { icon: Navigation, color: "#16a34a", tone: "success" },
  ULTRASONIC: { icon: Radar, color: "#6366f1", tone: "info" },
  CAMERA: { icon: Camera, color: "#9333ea", tone: "info" },
  SERVO: { icon: Compass, color: "#0891b2", tone: "info" },
  SOIL: { icon: ListTree, color: "#a16207", tone: "warning" },
  PUMP: { icon: Droplets, color: "#0ea5e9", tone: "info" },
  GPS: { icon: MapPin, color: "#dc2626", tone: "danger" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function LogsClient({ initialLogs }: { initialLogs: RobotLog[] }) {
  const [logs] = useState<RobotLog[]>(initialLogs);
  const chronological = [...logs].reverse();

  return (
    <DashboardShell title="Activity Log" subtitle="Detect → verify → probe → water → save">
      {chronological.length === 0 && (
        <Card className="p-4 text-sm text-muted">
          No activity logged yet — logs appear here as the robot detects and
          checks plants.
        </Card>
      )}

      <div className="space-y-2">
        {chronological.map((log) => {
          const meta = EVENT_META[log.event_type] ?? {
            icon: ListTree,
            color: "#6b7280",
            tone: "muted" as const,
          };
          const Icon = meta.icon;
          return (
            <Card key={log.id} className="flex items-center gap-3 p-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
              >
                <Icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <StatusBadge label={log.event_type} tone={meta.tone} />
                  {log.plant_id != null && (
                    <span className="text-xs text-muted">Plant {log.plant_id}</span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-foreground dark:text-gray-100">
                  {log.message}
                  {log.value != null && (
                    <span className="text-muted"> ({log.value})</span>
                  )}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted">{timeAgo(log.created_at)}</span>
            </Card>
          );
        })}
      </div>
    </DashboardShell>
  );
}
