"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RobotStatus, SensorReading, DeviceMessage, RobotCommandRow } from "@/lib/types";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, SectionHeading, StatusBadge } from "@/components/ui-kit";
import {
  Cpu,
  Wifi,
  WifiOff,
  MapPin,
  Thermometer,
  Droplet,
  Gauge,
  Battery,
  Radio,
  Bot,
  Zap,
  Navigation,
  Terminal,
  MessageSquare,
  Cog,
  Info,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Camera,
  Clock,
} from "lucide-react";

const ROBOT_ID = "agribot-01";
const CAM_ROBOT_ID = "agribot-01-cam";
const HEARTBEAT_STALE_MS = 30_000;
const CAMERA_BUCKET = "robot-images";
const CAMERA_STALE_MS = 15_000;
const CAMERA_POLL_MS = 5000;
const TICK_MS = 1000;
const MESSAGE_ROWS = 12;
const COMMAND_ROWS = 8;

function timeAgo(iso: string | null | undefined, now: number): string {
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
  return `${Math.floor(h / 24)}d ago`;
}

function absoluteTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Small labeled stat tile used in the telemetry grid */
function Stat({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: React.ElementType;
  color: string;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}1a`, color }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted dark:text-gray-400">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground dark:text-gray-100">{value}</p>
      </div>
    </div>
  );
}

const LEVEL_STYLE: Record<DeviceMessage["level"], { color: string; icon: React.ElementType }> = {
  info: { color: "#0ea5e9", icon: Info },
  success: { color: "#16a34a", icon: CheckCircle2 },
  warning: { color: "#f59e0b", icon: AlertTriangle },
  error: { color: "#dc2626", icon: AlertTriangle },
};

/** Compact row for a single link's health — used in the Link Health card */
function LinkRow({
  icon: Icon,
  color,
  title,
  online,
  agoLabel,
  detail,
}: {
  icon: React.ElementType;
  color: string;
  title: string;
  online: boolean;
  agoLabel: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground dark:text-gray-100">{title}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted dark:text-gray-400">
            <Clock className="h-3 w-3" />
            {agoLabel}
            {detail && <span className="truncate">· {detail}</span>}
          </p>
        </div>
      </div>
      <StatusBadge label={online ? "Online" : "Offline"} tone={online ? "success" : "muted"} />
    </div>
  );
}

export default function DevicePage() {
  const supabase = useRef(createClient()).current;

  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [latest, setLatest] = useState<SensorReading | null>(null);
  const [messages, setMessages] = useState<DeviceMessage[]>([]);
  const [commands, setCommands] = useState<RobotCommandRow[]>([]);
  const [cameraLastSeen, setCameraLastSeen] = useState<string | null>(null);
  const [cameraChecked, setCameraChecked] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<RobotStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Initial fetch — everything in parallel
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: statusRow }, { data: camStatusRow }, { data: latestRow }, { data: msgRows }, { data: cmdRows }] =
        await Promise.all([
          supabase.from("robot_status").select("*").eq("robot_id", ROBOT_ID).single<RobotStatus>(),
          supabase
            .from("robot_status")
            .select("*")
            .eq("robot_id", CAM_ROBOT_ID)
            .maybeSingle<RobotStatus>(),
          supabase
            .from("sensor_data")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle<SensorReading>(),
          supabase
            .from("device_messages")
            .select("*")
            .eq("robot_id", ROBOT_ID)
            .order("created_at", { ascending: false })
            .limit(MESSAGE_ROWS)
            .returns<DeviceMessage[]>(),
          supabase
            .from("robot_commands")
            .select("*")
            .eq("robot_id", ROBOT_ID)
            .order("created_at", { ascending: false })
            .limit(COMMAND_ROWS)
            .returns<RobotCommandRow[]>(),
        ]);
      if (cancelled) return;
      if (statusRow) setStatus(statusRow);
      if (camStatusRow) setCameraStatus(camStatusRow);
      if (latestRow) setLatest(latestRow);
      if (msgRows) setMessages(msgRows);
      if (cmdRows) setCommands(cmdRows);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Realtime: robot_status
  useEffect(() => {
    const channel = supabase
      .channel("device_page_status")
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

  // Realtime: robot_status for the camera's own heartbeat row
  // (separate row/id from the main robot — see CAM_ROBOT_ID note in
  // esp32cam_supabase_upload.ino). Gives us camera_ip without polling.
  useEffect(() => {
    const channel = supabase
      .channel("device_page_cam_status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "robot_status", filter: `robot_id=eq.${CAM_ROBOT_ID}` },
        (payload) => setCameraStatus(payload.new as RobotStatus)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Realtime: sensor_data
  useEffect(() => {
    const channel = supabase
      .channel("device_page_sensors")
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

  // Realtime: device_messages
  useEffect(() => {
    const channel = supabase
      .channel("device_page_messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "device_messages", filter: `robot_id=eq.${ROBOT_ID}` },
        (payload) => {
          const row = payload.new as DeviceMessage;
          setMessages((prev) => [row, ...prev].slice(0, MESSAGE_ROWS));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Realtime: robot_commands
  useEffect(() => {
    const channel = supabase
      .channel("device_page_commands")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "robot_commands", filter: `robot_id=eq.${ROBOT_ID}` },
        (payload) => {
          const row = payload.new as RobotCommandRow;
          setCommands((prev) => {
            const withoutOld = prev.filter((c) => c.id !== row.id);
            return [row, ...withoutOld]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, COMMAND_ROWS);
          });
        }
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
      setCameraLastSeen(latestFile.created_at ?? latestFile.updated_at ?? null);
    }

    fetchLatestImage();
    const interval = setInterval(fetchLatestImage, CAMERA_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [supabase]);

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

  // Live stream availability is judged from the camera's own heartbeat
  // (fresher signal than the Storage-upload check above, since the
  // heartbeat lands every 5s) plus needing a camera_ip to build the URL.
  const cameraHeartbeatOnline =
    !!cameraStatus?.updated_at && now - new Date(cameraStatus.updated_at).getTime() < HEARTBEAT_STALE_MS;
  const cameraStreamUrl = cameraStatus?.camera_ip ? `http://${cameraStatus.camera_ip}/stream` : null;
  const streamAvailable = cameraHeartbeatOnline && !!cameraStreamUrl;

  return (
    <DashboardShell title="ESP32 Device" subtitle={ROBOT_ID} online={heartbeatOnline}>
      <>
        <SectionHeading
          eyebrow="Full Device View"
          title="Everything about your ESP32"
          desc="Live status, sensors, GPS, recent commands, and the message log — all in one place."
        />

        {/* Top status card */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-white shadow-sm"
                style={{ backgroundColor: heartbeatOnline ? "#16a34a" : "#9ca3af" }}
              >
                {heartbeatOnline ? <Wifi className="h-6 w-6" /> : <WifiOff className="h-6 w-6" />}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground dark:text-gray-100">
                  {ROBOT_ID}
                </p>
                <p className="text-xs text-muted dark:text-gray-400">
                  Last heartbeat {timeAgo(status?.updated_at, now)} · {absoluteTime(status?.updated_at)}
                </p>
              </div>
            </div>
            <StatusBadge label={heartbeatOnline ? "Online" : "Offline"} tone={heartbeatOnline ? "success" : "muted"} />
          </div>
        </Card>

        {/* Link health — per-subsystem online/offline */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-400">
            Link Health
          </p>
          <Card className="p-3">
            <div className="flex flex-col divide-y divide-border dark:divide-gray-800">
              <LinkRow
                icon={heartbeatOnline ? Wifi : WifiOff}
                color="#16a34a"
                title="ESP32 Heartbeat"
                online={heartbeatOnline}
                agoLabel={timeAgo(status?.updated_at, now)}
                detail={status ? `mode: ${status.mode}` : undefined}
              />
              <LinkRow
                icon={MapPin}
                color="#0ea5e9"
                title="GPS Location"
                online={gpsOnline}
                agoLabel={timeAgo(latest?.created_at, now)}
                detail={hasGps ? `${latest!.latitude!.toFixed(5)}, ${latest!.longitude!.toFixed(5)}` : "no fix"}
              />
              <LinkRow
                icon={Thermometer}
                color="#f59e0b"
                title="Sensors"
                online={sensorOnline}
                agoLabel={timeAgo(latest?.created_at, now)}
              />
              <LinkRow
                icon={Camera}
                color="#8b5cf6"
                title="Camera (ESP32-CAM)"
                online={cameraOnline}
                agoLabel={cameraChecked ? timeAgo(cameraLastSeen, now) : "Checking…"}
              />
            </div>
          </Card>
        </div>

        {/* Live camera stream — local WiFi only, see note below */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-400">
            Live Camera
          </p>
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4" style={{ color: "#8b5cf6" }} />
                <p className="text-sm font-semibold text-foreground dark:text-gray-100">
                  AGRIBOT Live Camera
                </p>
              </div>
              <StatusBadge
                label={streamAvailable ? "Live" : "Unavailable"}
                tone={streamAvailable ? "success" : "muted"}
              />
            </div>

            {streamAvailable ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cameraStreamUrl!}
                alt="AGRIBOT live camera stream"
                className="w-full rounded-xl border border-border dark:border-gray-800"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted dark:border-gray-800 dark:text-gray-400">
                {cameraStatus?.camera_ip
                  ? "Camera heartbeat stale — stream unavailable"
                  : "Waiting for camera to report its IP…"}
              </div>
            )}

            <p className="mt-2 text-[11px] text-muted dark:text-gray-500">
              Local WiFi only — this stream loads directly from the camera&apos;s
              IP ({cameraStatus?.camera_ip ?? "unknown"}), so it only plays when
              your device is on the same network as AGRIBOT.
            </p>
          </Card>
        </div>

        {/* Robot state */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-400">
            Robot State
          </p>
          <Card className="grid grid-cols-2 gap-y-4 p-4">
            <Stat icon={Cog} color="#6366f1" label="Mode" value={status?.mode ?? "—"} />
            <Stat icon={Bot} color="#3b82f6" label="Motor" value={status?.motor_state ?? "—"} />
            <Stat icon={Zap} color="#16a34a" label="Pump" value={status?.pump_status ? "ON" : "OFF"} />
            <Stat icon={Gauge} color="#8b5cf6" label="Speed" value={status?.speed_value ?? "—"} />
          </Card>
        </div>

        {/* Sensors */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-400">
            Sensors · {timeAgo(latest?.created_at, now)}
          </p>
          <Card className="grid grid-cols-2 gap-y-4 p-4">
            <Stat
              icon={Thermometer}
              color="#f59e0b"
              label="Temperature"
              value={latest?.temperature != null ? `${latest.temperature}°C` : "—"}
            />
            <Stat
              icon={Radio}
              color="#0ea5e9"
              label="Humidity"
              value={latest?.humidity != null ? `${latest.humidity}%` : "—"}
            />
            <Stat
              icon={Droplet}
              color="#16a34a"
              label="Soil Moisture"
              value={latest?.soil_moisture != null ? `${latest.soil_moisture}%` : "—"}
            />
            <Stat
              icon={Navigation}
              color="#8b5cf6"
              label="Ultrasonic"
              value={latest?.distance_cm != null ? `${latest.distance_cm.toFixed(1)} cm` : "—"}
            />
            <Stat
              icon={Battery}
              color="#dc2626"
              label="Battery"
              value={
                latest?.battery_voltage != null
                  ? `${latest.battery_voltage.toFixed(1)}V (${latest.battery_percent ?? "—"}%)`
                  : "—"
              }
            />
            <Stat
              icon={MapPin}
              color="#f97316"
              label="GPS"
              value={hasGps ? `${latest!.latitude!.toFixed(5)}, ${latest!.longitude!.toFixed(5)}` : "No fix"}
            />
          </Card>
        </div>

        {/* Recent commands */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-400">
            Recent Commands
          </p>
          <Card className="p-3">
            {commands.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted dark:text-gray-400">No commands yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border dark:divide-gray-800">
                {commands.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Terminal className="h-3.5 w-3.5 shrink-0 text-muted dark:text-gray-500" />
                      <span className="truncate text-sm font-medium text-foreground dark:text-gray-100">
                        {c.command}
                        {c.value != null ? ` (${c.value})` : ""}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] text-muted dark:text-gray-500">{timeAgo(c.created_at, now)}</span>
                      <StatusBadge
                        label={c.executed ? "Executed" : "Pending"}
                        tone={c.executed ? "success" : "warning"}
                        dot={false}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Message log */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-400">
         
