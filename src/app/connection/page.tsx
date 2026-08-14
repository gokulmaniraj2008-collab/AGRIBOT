"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RobotStatus, SensorReading } from "@/lib/types";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, SectionHeading, StatusBadge } from "@/components/ui-kit";
import {
  Wifi,
  WifiOff,
  MapPin,
  Thermometer,
  Droplet,
  Camera,
  Clock,
  Radio,
} from "lucide-react";

const ROBOT_ID = "agribot-01";
const HEARTBEAT_STALE_MS = 30_000; // robot_status considered stale after this
const CAMERA_BUCKET = "robot-images";
const CAMERA_STALE_MS = 15_000;
const TICK_MS = 1000; // re-render "X ago" labels every second
const CAMERA_POLL_MS = 5000;

/** "3s ago" / "4m ago" / "2h ago" / "—" for null */
function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  const s = Math.floor(diffMs / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function absoluteTime(iso: string | null): string {
  if (!iso) return "No data received yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No data received yet";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusRow({
  icon: Icon,
  color,
  title,
  online,
  agoLabel,
  absoluteLabel,
  detail,
}: {
  icon: React.ElementType;
  color: string;
  title: string;
  online: boolean;
  agoLabel: string;
  absoluteLabel: string;
  detail?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground dark:text-gray-100">{title}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted dark:text-gray-400">
              <Clock className="h-3 w-3" />
              {agoLabel}
              <span className="text-muted/60 dark:text-gray-600">· {absoluteLabel}</span>
            </p>
            {detail && <div className="mt-2">{detail}</div>}
          </div>
        </div>
        <StatusBadge
          label={online ? "Online" : "Offline"}
          tone={online ? "success" : "muted"}
        />
      </div>
    </Card>
  );
}

export default function ConnectionPage() {
  const supabase = useRef(createClient()).current;

  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [latest, setLatest] = useState<SensorReading | null>(null);
  const [cameraLastSeen, setCameraLastSeen] = useState<string | null>(null);
  const [cameraChecked, setCameraChecked] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Initial fetch: robot_status + latest sensor reading
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: statusRow }, { data: latestRow }] = await Promise.all([
        supabase
          .from("robot_status")
          .select("*")
          .eq("robot_id", ROBOT_ID)
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

  // Realtime: robot_status changes (heartbeat)
  useEffect(() => {
    const channel = supabase
      .channel("connection_robot_status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "robot_status", filter: `robot_id=eq.${ROBOT_ID}` },
        (payload) => setStatus(payload.new as RobotStatus)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Realtime: new sensor readings (GPS + sensor last-seen)
  useEffect(() => {
    const channel = supabase
      .channel("connection_sensor_data")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensor_data" },
        (payload) => setLatest(payload.new as SensorReading)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Poll Storage for the newest camera frame (camera has no realtime signal)
  useEffect(() => {
    let cancelled = false;

    async function fetchLatestImage() {
      const { data, error } = await supabase.storage.from(CAMERA_BUCKET).list("", {
        limit: 1,
        sortBy: { column: "created_at", order: "desc" },
        search: ROBOT_ID,
      });
      if (cancelled) return;
      setCameraChecked(true);
      if (error || !data || data.length === 0) return;
      const latestFile = data[0];
      // Prefer the file's own created_at metadata; fall back to updated_at.
      setCameraLastSeen(latestFile.created_at ?? latestFile.updated_at ?? null);
    }

    fetchLatestImage();
    const interval = setInterval(fetchLatestImage, CAMERA_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [supabase]);

  // Tick every second so "X ago" labels stay live
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const heartbeatOnline =
    !!status?.online &&
    !!status?.updated_at &&
    now - new Date(status.updated_at).getTime() < HEARTBEAT_STALE_MS;

  const hasGps = latest?.latitude != null && latest?.longitude != null;
  const gpsOnline =
    hasGps && !!latest?.created_at && now - new Date(latest.created_at).getTime() < HEARTBEAT_STALE_MS;

  const sensorOnline =
    !!latest?.created_at && now - new Date(latest.created_at).getTime() < HEARTBEAT_STALE_MS;

  const cameraOnline =
    !!cameraLastSeen && now - new Date(cameraLastSeen).getTime() < CAMERA_STALE_MS;

  const overallOnline = heartbeatOnline;

  return (
    <DashboardShell title="Connection" subtitle={ROBOT_ID} online={overallOnline}>
      <>
        <SectionHeading
          eyebrow="Device Status"
          title="ESP32 Connection"
          desc="Live link health for the robot, its sensors, and the camera."
        />

        <div className="flex flex-col gap-3">
          <StatusRow
            icon={heartbeatOnline ? Wifi : WifiOff}
            color="#16a34a"
            title="ESP32 Heartbeat"
            online={heartbeatOnline}
            agoLabel={timeAgo(status?.updated_at ?? null, now)}
            absoluteLabel={absoluteTime(status?.updated_at ?? null)}
            detail={
              status && (
                <p className="text-xs text-muted dark:text-gray-400">
                  Mode: <span className="font-medium text-foreground dark:text-gray-200">{status.mode}</span>
                </p>
              )
            }
          />

          <StatusRow
            icon={MapPin}
            color="#0ea5e9"
            title="GPS Location"
            online={gpsOnline}
            agoLabel={timeAgo(latest?.created_at ?? null, now)}
            absoluteLabel={absoluteTime(latest?.created_at ?? null)}
            detail={
              hasGps ? (
                <p className="text-xs font-medium text-foreground dark:text-gray-200">
                  {latest!.latitude!.toFixed(5)}, {latest!.longitude!.toFixed(5)}
                </p>
              ) : (
                <p className="text-xs text-muted dark:text-gray-400">No GPS fix received yet</p>
              )
            }
          />

          <StatusRow
            icon={Thermometer}
            color="#f59e0b"
            title="Sensors"
            online={sensorOnline}
            agoLabel={timeAgo(latest?.created_at ?? null, now)}
            absoluteLabel={absoluteTime(latest?.created_at ?? null)}
            detail={
              latest && (
                <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                  <span className="flex items-center gap-1 text-muted dark:text-gray-400">
                    <Thermometer className="h-3 w-3" />
                    {latest.temperature != null ? `${latest.temperature}°C` : "—"}
                  </span>
                  <span className="flex items-center gap-1 text-muted dark:text-gray-400">
                    <Droplet className="h-3 w-3" />
                    {latest.soil_moisture != null ? `${latest.soil_moisture}%` : "—"}
                  </span>
                  <span className="flex items-center gap-1 text-muted dark:text-gray-400">
                    <Radio className="h-3 w-3" />
                    {latest.humidity != null ? `${latest.humidity}%` : "—"}
                  </span>
                </div>
              )
            }
          />

          <StatusRow
            icon={Camera}
            color="#8b5cf6"
            title="Camera (ESP32-CAM)"
            online={cameraOnline}
            agoLabel={cameraChecked ? timeAgo(cameraLastSeen, now) : "Checking…"}
            absoluteLabel={cameraChecked ? absoluteTime(cameraLastSeen) : ""}
          />
        </div>

        <p className="mt-4 text-center text-[11px] text-muted dark:text-gray-500">
          A device is marked online if it has reported within the last{" "}
          {HEARTBEAT_STALE_MS / 1000}s (camera: {CAMERA_STALE_MS / 1000}s).
        </p>
      </>
    </DashboardShell>
  );
              }
                                 
