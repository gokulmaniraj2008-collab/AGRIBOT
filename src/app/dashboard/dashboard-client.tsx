"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HomeVideo, SensorReading } from "@/lib/types";
import { formatAgriBotTimeOnly } from "@/lib/time";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, StatCard, AIBanner, SectionHeading } from "@/components/ui-kit";
import VideoQuickBox from "@/components/video-quick-box";
import {
  Battery, Bot, CircleDot, Droplets, Gauge, Lightbulb, MapPin,
  Play, Power, Ruler, ShieldAlert, Square, Thermometer, Wind, Zap,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

export default function DashboardClient({
  initialReadings = [],
  initialHomeVideos = [],
  isAdmin = false,
}: {
  initialReadings?: SensorReading[];
  initialHomeVideos?: HomeVideo[];
  isAdmin?: boolean;
}) {
  const supabase = useRef(createClient()).current;
  const [readings, setReadings] = useState<SensorReading[]>(initialReadings);
  const [homeVideos, setHomeVideos] = useState<HomeVideo[]>(initialHomeVideos);
  const [commandBusy, setCommandBusy] = useState<string | null>(null);
  const [commandMessage, setCommandMessage] = useState("");

  useEffect(() => {
    const poll = async () => {
      const { data } = await supabase
        .from("agribot_sensor_data")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<SensorReading[]>();
      if (data) setReadings(data);
    };

    const loadVideos = async () => {
      const { data } = await supabase
        .from("home_videos")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .returns<HomeVideo[]>();
      if (data) setHomeVideos(data);
    };

    poll();
    loadVideos();
    const interval = window.setInterval(poll, 5000);

    return () => window.clearInterval(interval);
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("agribot_dashboard_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agribot_sensor_data" },
        (payload) => {
          const reading = payload.new as SensorReading;
          setReadings((prev) =>
            [reading, ...prev.filter((item) => item.id !== reading.id)]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 50)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const latest = readings[0];
  const chronological = [...readings].reverse();
  const chartData = chronological.map((r) => ({
    time: formatAgriBotTimeOnly(r.created_at).slice(0, 5),
    leftSoil: r.soil_left_pct,
    rightSoil: r.soil_right_pct,
  }));

  const lastUpdated = latest?.created_at ? formatAgriBotTimeOnly(latest.created_at) : null;
  const isFresh = latest?.created_at
    ? Date.now() - new Date(latest.created_at).getTime() < 30000
    : false;

  const leftSoil = latest?.soil_left_pct;
  const rightSoil = latest?.soil_right_pct;
  const leftPump = latest?.relay_left === true;
  const rightPump = latest?.relay_right === true;

  const aiTip =
    leftSoil != null && leftSoil < 30
      ? rightSoil != null && rightSoil < 30
        ? "Both plant zones are below the 30% irrigation threshold. Verify pumps and begin a controlled watering cycle."
        : "Left plant is below the 30% threshold. A left-zone watering cycle is recommended."
      : rightSoil != null && rightSoil < 30
        ? "Right plant is below the 30% threshold. A right-zone watering cycle is recommended."
        : latest?.battery_percent != null && latest.battery_percent < 20
          ? "Battery is below 20%. Charge the robot before starting another field run."
          : "Both plant zones are currently above the irrigation threshold. Continue monitoring.";

  async function sendCommand(command: string, value?: number) {
    setCommandBusy(command);
    setCommandMessage("");
    try {
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, value }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Command failed");
      setCommandMessage(`Command sent: ${command.replaceAll("_", " ")}`);
    } catch (error) {
      setCommandMessage(error instanceof Error ? error.message : "Command failed");
    } finally {
      setCommandBusy(null);
    }
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <DashboardShell title="AGRIBOT AI" subtitle="Unified Robot Control Center" isAdmin={isAdmin}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-foreground dark:text-gray-100">{greeting} 👋</h2>
          <p className="mt-1 text-xs text-muted dark:text-gray-400">One dashboard for robot, two plants, sensors, irrigation and AI.</p>
        </div>
        {lastUpdated && <p className="text-[11px] text-muted dark:text-gray-400">Updated {lastUpdated}</p>}
      </div>

      <div className="mb-4">
        <AIBanner text={aiTip} cta="AI recommendation" />
      </div>

      <Card className="mb-4 overflow-hidden p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`flex h-11 w-11 items-center justify-center rounded-full ${isFresh ? "bg-green-500/10 text-green-600" : "bg-gray-500/10 text-gray-500"}`}>
              <CircleDot className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground dark:text-gray-100">AGRIBOT-01 · {isFresh ? "Online" : "Waiting"}</p>
              <p className="text-xs text-muted dark:text-gray-400">
                {latest?.plant_position ? `Station: ${latest.plant_position}` : "Two-plant irrigation station"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <StatusPill label="Motor" value={latest?.motor ?? "—"} />
            <StatusPill label="Left pump" value={leftPump ? "ON" : "OFF"} active={leftPump} />
            <StatusPill label="Right pump" value={rightPump ? "ON" : "OFF"} active={rightPump} />
            <StatusPill label="Battery" value={latest?.battery_percent != null ? `${latest.battery_percent.toFixed(0)}%` : "—"} />
          </div>
        </div>
      </Card>

      <SectionHeading eyebrow="Live system" title="Everything in one view" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard icon={Droplets} label="Left Soil" value={leftSoil != null ? leftSoil.toFixed(0) : "—"} unit="%" percent={leftSoil ?? undefined} />
        <StatCard icon={Droplets} label="Right Soil" value={rightSoil != null ? rightSoil.toFixed(0) : "—"} unit="%" percent={rightSoil ?? undefined} />
        <StatCard icon={Wind} label="Humidity" value={latest?.humidity != null ? latest.humidity.toFixed(0) : "—"} unit="%" percent={latest?.humidity ?? undefined} />
        <StatCard icon={Thermometer} label="Temperature" value={latest?.temperature != null ? latest.temperature.toFixed(1) : "—"} unit="°C" />
        <StatCard icon={Battery} label="Battery" value={latest?.battery_percent != null ? latest.battery_percent.toFixed(0) : "—"} unit="%" percent={latest?.battery_percent ?? undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <PlantCard
          side="Left Plant"
          soil={leftSoil}
          pump={leftPump}
          distance={latest?.distance_left_cm}
          onWater={() => sendCommand("pump_on")}
          busy={commandBusy === "pump_on"}
        />
        <PlantCard
          side="Right Plant"
          soil={rightSoil}
          pump={rightPump}
          distance={latest?.distance_right_cm}
          onWater={() => sendCommand("pump_on")}
          busy={commandBusy === "pump_on"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-foreground dark:text-gray-100">Soil intelligence</p>
              <p className="text-[11px] text-muted dark:text-gray-400">Recent left/right moisture trend</p>
            </div>
            <Gauge className="h-4 w-4 text-muted" />
          </div>
          <div className="h-48 w-full">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6ebe8" />
                  <XAxis dataKey="time" stroke="#6b7583" fontSize={10} tickLine={false} />
                  <YAxis stroke="#6b7583" fontSize={10} tickLine={false} width={30} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e6ebe8", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="leftSoil" name="Left soil %" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="rightSoil" name="Right soil %" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted">Waiting for more robot readings.</div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-bold text-foreground dark:text-gray-100">AI Field Assistant</p>
              <p className="text-[11px] text-muted dark:text-gray-400">Sensor-based recommendation</p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <Insight icon={Lightbulb} title="Current decision" text={aiTip} />
            <Insight icon={MapPin} title="Station" text={latest?.plant_position || "Waiting for station marker"} />
            <Insight icon={Ruler} title="Obstacle sensing" text={`Left ${latest?.distance_left_cm?.toFixed(0) ?? "—"} cm · Right ${latest?.distance_right_cm?.toFixed(0) ?? "—"} cm`} />
            {latest?.battery_percent != null && latest.battery_percent < 20 && (
              <Insight icon={ShieldAlert} title="Safety" text="Low battery: avoid starting a long mission." />
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <SectionHeading eyebrow="Control" title="Robot commands" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <CommandButton icon={Play} label="Forward" onClick={() => sendCommand("forward")} busy={commandBusy === "forward"} />
          <CommandButton icon={Square} label="Stop" danger onClick={() => sendCommand("stop")} busy={commandBusy === "stop"} />
          <CommandButton icon={Power} label="Auto Mode" onClick={() => sendCommand("set_mode_auto")} busy={commandBusy === "set_mode_auto"} />
          <CommandButton icon={Zap} label="Manual Mode" onClick={() => sendCommand("set_mode_manual")} busy={commandBusy === "set_mode_manual"} />
          <CommandButton icon={Droplets} label="Auto Irrigation" onClick={() => sendCommand("set_irrigation_auto_on")} busy={commandBusy === "set_irrigation_auto_on"} />
          <CommandButton icon={ShieldAlert} label="Safety Reset" onClick={() => sendCommand("safety_reset")} busy={commandBusy === "safety_reset"} />
        </div>
        {commandMessage && <p className="mt-3 text-xs font-medium text-primary">{commandMessage}</p>}
      </Card>

      <Card className="mt-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniMetric icon={Ruler} label="Left Distance" value={latest?.distance_left_cm != null ? `${latest.distance_left_cm.toFixed(0)} cm` : "—"} />
          <MiniMetric icon={Ruler} label="Right Distance" value={latest?.distance_right_cm != null ? `${latest.distance_right_cm.toFixed(0)} cm` : "—"} />
          <MiniMetric icon={CircleDot} label="Plant Position" value={latest?.plant_position || "—"} />
        </div>
      </Card>

      {homeVideos.length > 0 && <div className="mt-4"><VideoQuickBox videos={homeVideos} /></div>}

      <div className="mt-4 rounded-xl border border-primary/10 bg-primary/5 p-3 text-xs text-muted dark:text-gray-400">
        AI uses the latest sensor data for recommendations. The ESP32 firmware remains the safety layer for physical pump and motor control.
      </div>
    </DashboardShell>
  );
}

function PlantCard({
  side, soil, pump, distance, onWater, busy,
}: {
  side: string;
  soil: number | null | undefined;
  pump: boolean;
  distance: number | null | undefined;
  onWater: () => void;
  busy: boolean;
}) {
  const dry = soil != null && soil < 30;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-bold text-foreground dark:text-gray-100">{side}</p>
          <p className="text-xs text-muted dark:text-gray-400">{dry ? "Needs attention" : "Moisture OK"}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${pump ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
          {pump ? "WATERING" : "IDLE"}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniMetric icon={Droplets} label="Soil" value={soil != null ? `${soil.toFixed(0)}%` : "—"} active={dry} />
        <MiniMetric icon={Ruler} label="Distance" value={distance != null ? `${distance.toFixed(0)} cm` : "—"} />
      </div>
      <button
        type="button"
        onClick={onWater}
        disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        <Droplets className="h-4 w-4" />
        {busy ? "Sending…" : "Water zone"}
      </button>
    </Card>
  );
}

function Insight({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground dark:text-gray-100">
        <Icon className="h-4 w-4 text-primary" />{title}
      </div>
      <p className="mt-1 text-xs leading-5 text-muted dark:text-gray-400">{text}</p>
    </div>
  );
}

function MiniMetric({ icon: Icon, label, value, active = false }: { icon: React.ElementType; label: string; value: string; active?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted"}`} />
        <span className="text-[11px] text-muted dark:text-gray-400">{label}</span>
      </div>
      <p className="mt-1 text-sm font-bold text-foreground dark:text-gray-100">{value}</p>
    </div>
  );
}

function StatusPill({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 ${active ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted dark:border-gray-700 dark:text-gray-400"}`}>
      {label}: {value}
    </span>
  );
}

function CommandButton({
  icon: Icon, label, onClick, busy, danger = false,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  busy: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition hover:shadow-sm disabled:opacity-50 ${danger ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" : "border-border bg-white text-foreground dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"}`}
    >
      <Icon className="h-4 w-4" />{busy ? "Sending…" : label}
    </button>
  );
}
