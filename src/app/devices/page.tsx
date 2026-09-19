"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, StatusBadge, IconTile, SectionHeading } from "@/components/ui-kit";
import type { SensorReading } from "@/lib/types";
import {
  Bot, ArrowLeft, RefreshCw, Clock, Thermometer, Droplets, Sprout,
  Radar, BatteryMedium, MapPin, Camera, Cpu,
} from "lucide-react";

const ROBOT_ID = "agribot-01";
const HEARTBEAT_STALE_MS = 30_000;
const CAMERA_STALE_MS = 15_000;
const CAMERA_POLL_MS = 5_000;
const SENSOR_POLL_MS = 5_000;
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

function SubDeviceRow({ icon: Icon, color, title, connected, agoLabel, detail }: {
  icon: React.ElementType; color: string; title: string; connected: boolean;
  agoLabel: string; detail?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}1a`, color }}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground dark:text-gray-100">{title}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted dark:text-gray-400">
            <Clock className="h-3 w-3" />{agoLabel}{detail && <span className="truncate">· {detail}</span>}
          </p>
        </div>
      </div>
      {connected && <StatusBadge label="Connected" tone="success" />}
    </div>
  );
}

function DeviceCard({ icon: Icon, color, title, subtitle, connected, agoLabel, detail }: {
  icon: React.ElementType; color: string; title: string; subtitle: string; connected: boolean;
  agoLabel: string; detail?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2.5">
          <IconTile icon={Icon} size={36} color={color} />
          <span>
            <span className="block text-sm font-semibold text-foreground dark:text-gray-100">{title}</span>
            <span className="block text-[11px] text-muted dark:text-gray-400">{subtitle}</span>
          </span>
        </span>
        {connected && <StatusBadge label="Connected" tone="success" />}
      </div>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted dark:text-gray-400">
        <Clock className="h-3 w-3" />{agoLabel}{detail && <span className="truncate">· {detail}</span>}
      </p>
    </Card>
  );
}

export default function DevicesPage() {
  const supabase = useRef(createClient()).current;
  const [latest, setLatest] = useState<SensorReading | null>(null);
  const [cameraLastSeen, setCameraLastSeen] = useState<string | null>(null);
  const [cameraChecked, setCameraChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  async function loadLatestSensor() {
    const { data } = await supabase.from("agribot_sensor_data").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle<SensorReading>();
    setLatest(data ?? null);
    return data ?? null;
  }

  async function loadLatestCameraFrame() {
    const { data } = await supabase.storage.from(CAMERA_BUCKET).list("", { limit: 1, sortBy: { column: "created_at", order: "desc" }, search: ROBOT_ID });
    const file = data?.[0];
    setCameraChecked(true);
    setCameraLastSeen(file?.created_at ?? file?.updated_at ?? null);
  }

  async function loadAll() {
    await Promise.all([loadLatestSensor(), loadLatestCameraFrame()]);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadAll();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const interval = setInterval(loadLatestSensor, SENSOR_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(loadLatestCameraFrame, CAMERA_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  async function refresh() {
    setBusy(true);
    await loadAll();
    setBusy(false);
  }

  const sensorConnected = !!latest?.created_at && now - new Date(latest.created_at).getTime() < HEARTBEAT_STALE_MS;
  const hasGps = latest?.latitude != null && latest?.longitude != null;
  const gpsConnected = hasGps && sensorConnected;
  const cameraConnected = !!cameraLastSeen && now - new Date(cameraLastSeen).getTime() < CAMERA_STALE_MS;
  const pumpOn = latest?.relay === true;
  const motorState = latest?.motor ?? "—";

  return (
    <DashboardShell title="Devices" subtitle="Connection status">
      <>
        <button onClick={() => window.history.back()} className="mb-4 flex items-center gap-1 text-xs font-medium text-muted transition hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />Back
        </button>

        <div className="mb-3 flex items-center justify-between">
          <SectionHeading eyebrow="ESP32" title="Connected devices" />
          <button onClick={refresh} disabled={busy} className="text-muted transition hover:text-foreground" aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-muted dark:text-gray-400">Loading…</p>
        ) : !latest ? (
          <Card className="p-4">
            <p className="text-xs text-muted dark:text-gray-400">No devices have reported in yet.</p>
            <p className="mt-1 text-[11px] text-muted dark:text-gray-500">Waiting for the ESP32 to send its first sensor reading.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2.5">
                  <IconTile icon={Bot} size={36} />
                  <span>
                    <span className="block text-sm font-semibold text-foreground dark:text-gray-100">AGRIBOT-01</span>
                    <span className="block text-[11px] text-muted dark:text-gray-400">ESP32 · Main controller</span>
                  </span>
                </span>
                {sensorConnected && <StatusBadge label="Connected" tone="success" />}
              </div>
              <p className="mt-2 flex items-center gap-1 text-[11px] text-muted dark:text-gray-400">
                <Clock className="h-3 w-3" />Last sensor reading {timeAgo(latest.created_at, now)}
              </p>
              <div className="mt-3 divide-y divide-border border-t border-border pt-1 dark:divide-gray-800 dark:border-gray-800">
                <SubDeviceRow icon={MapPin} color="#0ea5e9" title="GPS Module" connected={gpsConnected} agoLabel={timeAgo(latest.created_at, now)} detail={hasGps ? `${latest.latitude!.toFixed(5)}, ${latest.longitude!.toFixed(5)}` : "no fix"} />
                <SubDeviceRow icon={Camera} color="#8b5cf6" title="Camera (ESP32-CAM)" connected={cameraConnected} agoLabel={cameraChecked ? timeAgo(cameraLastSeen, now) : "Checking…"} />
                <SubDeviceRow icon={Cpu} color="#16a34a" title="Motor / Pump Controller" connected={sensorConnected} agoLabel={timeAgo(latest.created_at, now)} detail={`pump ${pumpOn ? "on" : "off"} · motor ${motorState}`} />
              </div>
            </Card>

            <DeviceCard icon={Thermometer} color="#f97316" title="Temperature" subtitle="AGRIBOT-01" connected={sensorConnected && latest.temperature != null} agoLabel={latest.temperature != null ? `Last reading ${timeAgo(latest.created_at, now)}` : "No reading yet"} detail={latest.temperature != null ? `${latest.temperature.toFixed(1)}°C` : undefined} />
            <DeviceCard icon={Droplets} color="#0ea5e9" title="Humidity" subtitle="AGRIBOT-01" connected={sensorConnected && latest.humidity != null} agoLabel={latest.humidity != null ? `Last reading ${timeAgo(latest.created_at, now)}` : "No reading yet"} detail={latest.humidity != null ? `${latest.humidity.toFixed(0)}%` : undefined} />
            <DeviceCard icon={Sprout} color="#16a34a" title="Soil Moisture" subtitle="AGRIBOT-01" connected={sensorConnected && latest.soil_moisture != null} agoLabel={latest.soil_moisture != null ? `Last reading ${timeAgo(latest.created_at, now)}` : "No reading yet"} detail={latest.soil_moisture != null ? `${latest.soil_moisture.toFixed(0)}%` : undefined} />
            <DeviceCard icon={Radar} color="#a855f7" title="Ultrasonic" subtitle="AGRIBOT-01" connected={sensorConnected && latest.distance_cm != null} agoLabel={latest.distance_cm != null ? `Last reading ${timeAgo(latest.created_at, now)}` : "No reading yet"} detail={latest.distance_cm != null ? `${latest.distance_cm.toFixed(0)} cm` : undefined} />
            <DeviceCard icon={BatteryMedium} color="#ef4444" title="Battery" subtitle="AGRIBOT-01" connected={sensorConnected && latest.battery_voltage != null} agoLabel={latest.battery_voltage != null ? `Last reading ${timeAgo(latest.created_at, now)` : "No reading yet"} detail={latest.battery_voltage != null ? `${latest.battery_voltage.toFixed(1)}V (${latest.battery_percent?.toFixed(0) ?? "—"}%)` : undefined} />
          </div>
        )}
      </>
    </DashboardShell>
  );
}
