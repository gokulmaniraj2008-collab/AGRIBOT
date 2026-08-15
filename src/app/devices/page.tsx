"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, StatusBadge, IconTile, SectionHeading } from "@/components/ui-kit";
import type { RobotStatus, SensorReading } from "@/lib/types";
import {
  Bot,
  ArrowLeft,
  RefreshCw,
  Clock,
  Thermometer,
  MapPin,
  Camera,
  Cpu,
} from "lucide-react";

const HEARTBEAT_STALE_MS = 30_000; // same threshold used on /robot, /admin/robot, /device
const CAMERA_STALE_MS = 15_000;
const CAMERA_POLL_MS = 5_000;
const CAMERA_BUCKET = "robot-images";
const TICK_MS = 1_000;

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

/** One sub-device row inside a controller card (Sensors, GPS, Camera, ...) */
function SubDeviceRow({
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
      <div className="flex min-w-0 items-center gap-2.5">
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
      <StatusBadge label={online ? "Connected" : "Disconnected"} tone={online ? "success" : "muted"} />
    </div>
  );
}

/** A top-level device card — same visual weight as the main controller card,
    used for devices that get their own row instead of being nested. */
function DeviceCard({
  icon: Icon,
  color,
  title,
  subtitle,
  online,
  agoLabel,
  detail,
}: {
  icon: React.ElementType;
  color: string;
  title: string;
  subtitle: string;
  online: boolean;
  agoLabel: string;
  detail?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2.5">
          <IconTile icon={Icon} size={36} color={color} />
          <span>
            <span className="block text-sm font-semibold text-foreground dark:text-gray-100">
              {title}
            </span>
            <span className="block text-[11px] text-muted dark:text-gray-400">{subtitle}</span>
          </span>
        </span>
        <StatusBadge label={online ? "Connected" : "Disconnected"} tone={online ? "success" : "muted"} />
      </div>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted dark:text-gray-400">
        <Clock className="h-3 w-3" />
        {agoLabel}
        {detail && <span className="truncate">· {detail}</span>}
      </p>
    </Card>
  );
}

export default function DevicesPage() {
  const supabase = createClient();
  const router = useRouter();

  const [devices, setDevices] = useState<RobotStatus[]>([]);
  const [latestByRobot, setLatestByRobot] = useState<Record<string, SensorReading>>({});
  const [cameraLastSeenByRobot, setCameraLastSeenByRobot] = useState<Record<string, string | null>>({});
  const [cameraChecked, setCameraChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  async function loadDevices() {
    const { data } = await supabase
      .from("robot_status")
      .select("*")
      .order("robot_id", { ascending: true })
      .returns<RobotStatus[]>();
    setDevices(data ?? []);
    return data ?? [];
  }

  async function loadLatestSensors(robotIds: string[]) {
    const entries = await Promise.all(
      robotIds.map(async (id) => {
        const { data } = await supabase
          .from("sensor_data")
          .select("*")
          .eq("robot_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<SensorReading>();
        return [id, data] as const;
      })
    );
    const map: Record<string, SensorReading> = {};
    for (const [id, data] of entries) if (data) map[id] = data;
    setLatestByRobot(map);
  }

  async function loadLatestCameraFrames(robotIds: string[]) {
    const entries = await Promise.all(
      robotIds.map(async (id) => {
        const { data } = await supabase.storage.from(CAMERA_BUCKET).list("", {
          limit: 1,
          sortBy: { column: "created_at", order: "desc" },
          search: id,
        });
        const file = data?.[0];
        return [id, file?.created_at ?? file?.updated_at ?? null] as const;
      })
    );
    setCameraChecked(true);
    setCameraLastSeenByRobot(Object.fromEntries(entries));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rows = await loadDevices();
      if (cancelled) return;
      const ids = rows.map((r) => r.robot_id);
      await Promise.all([loadLatestSensors(ids), loadLatestCameraFrames(ids)]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime — controller status
  useEffect(() => {
    const channel = supabase
      .channel("devices_page_status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "robot_status" },
        (payload) => {
          const row = payload.new as RobotStatus;
          setDevices((prev) => {
            const idx = prev.findIndex((d) => d.robot_id === row.robot_id);
            if (idx === -1) return [...prev, row].sort((a, b) => a.robot_id.localeCompare(b.robot_id));
            const next = [...prev];
            next[idx] = row;
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Realtime — sensor readings (feeds Sensors + GPS rows)
  useEffect(() => {
    const channel = supabase
      .channel("devices_page_sensors")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensor_data" },
        (payload) => {
          const row = payload.new as SensorReading & { robot_id?: string };
          const id = row.robot_id ?? "agribot-01";
          setLatestByRobot((prev) => ({ ...prev, [id]: row }));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Poll Storage for newest camera frame per device (camera has no realtime signal)
  useEffect(() => {
    if (devices.length === 0) return;
    const ids = devices.map((d) => d.robot_id);
    const interval = setInterval(() => loadLatestCameraFrames(ids), CAMERA_POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices.map((d) => d.robot_id).join(",")]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  async function refresh() {
    setBusy(true);
    const rows = await loadDevices();
    const ids = rows.map((r) => r.robot_id);
    await Promise.all([loadLatestSensors(ids), loadLatestCameraFrames(ids)]);
    setBusy(false);
  }

  return (
    <DashboardShell title="Devices" subtitle="Connection status">
      <>
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-1 text-xs font-medium text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>

        <div className="mb-3 flex items-center justify-between">
          <SectionHeading eyebrow="ESP32" title="Connected devices" />
          <button
            onClick={refresh}
            disabled={busy}
            className="text-muted transition hover:text-foreground"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-muted dark:text-gray-400">Loading…</p>
        ) : devices.length === 0 ? (
          <Card className="p-4">
            <p className="text-xs text-muted dark:text-gray-400">
              No devices have reported in yet.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {devices.map((d) => {
              const controllerStale =
                Date.now() - new Date(d.updated_at).getTime() > HEARTBEAT_STALE_MS;
              const controllerConnected = d.online && !controllerStale;

              const latest = latestByRobot[d.robot_id];
              const sensorConnected =
                !!latest?.created_at &&
                Date.now() - new Date(latest.created_at).getTime() < HEARTBEAT_STALE_MS;
              const hasGps = latest?.latitude != null && latest?.longitude != null;
              const gpsConnected = hasGps && sensorConnected;

              const cameraLastSeen = cameraLastSeenByRobot[d.robot_id] ?? null;
              const cameraConnected =
                !!cameraLastSeen && Date.now() - new Date(cameraLastSeen).getTime() < CAMERA_STALE_MS;

              return (
                <div key={d.robot_id} className="flex flex-col gap-3">
                  <Card className="p-4">
                    {/* Controller */}
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2.5">
                        <IconTile icon={Bot} size={36} />
                        <span>
                          <span className="block text-sm font-semibold text-foreground dark:text-gray-100">
                            {d.name || d.robot_id}
                          </span>
                          <span className="block text-[11px] text-muted dark:text-gray-400">
                            {d.robot_id} · Main controller
                          </span>
                        </span>
                      </span>
                      <StatusBadge
                        label={controllerConnected ? "Connected" : "Disconnected"}
                        tone={controllerConnected ? "success" : "muted"}
                      />
                    </div>
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-muted dark:text-gray-400">
                      <Clock className="h-3 w-3" />
                      Last heartbeat {timeAgo(d.updated_at, now)} · Mode {d.mode}
                    </p>

                    {/* Attached devices */}
                    <div className="mt-3 divide-y divide-border border-t border-border pt-1 dark:divide-gray-800 dark:border-gray-800">
                      <SubDeviceRow
                        icon={MapPin}
                        color="#0ea5e9"
                        title="GPS Module"
                        online={gpsConnected}
                        agoLabel={timeAgo(latest?.created_at, now)}
                        detail={hasGps ? `${latest!.latitude!.toFixed(5)}, ${latest!.longitude!.toFixed(5)}` : "no fix"}
                      />
                      <SubDeviceRow
                        icon={Camera}
                        color="#8b5cf6"
                        title="Camera (ESP32-CAM)"
                        online={cameraConnected}
                        agoLabel={cameraChecked ? timeAgo(cameraLastSeen, now) : "Checking…"}
                      />
                      <SubDeviceRow
                        icon={Cpu}
                        color="#16a34a"
                        title="Motor / Pump Controller"
                        online={controllerConnected}
                        agoLabel={timeAgo(d.updated_at, now)}
                        detail={`pump ${d.pump_status ? "on" : "off"} · motor ${d.motor_state}`}
                      />
                    </div>
                  </Card>

                  {/* Sensor Board — its own card, separate from the controller */}
                  <DeviceCard
                    icon={Thermometer}
                    color="#f59e0b"
                    title="Sensor Board"
                    subtitle={`${d.robot_id} · soil, temp, humidity, ultrasonic, battery`}
                    online={sensorConnected}
                    agoLabel={`Last reading ${timeAgo(latest?.created_at, now)}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </>
    </DashboardShell>
  );
    }

    
