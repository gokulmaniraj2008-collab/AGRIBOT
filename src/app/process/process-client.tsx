"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Droplets, Gauge, Radio, RotateCw, Sprout, Timer, Waves } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import type { AgriBotLogRow, SensorReading } from "@/lib/types";
import { formatAgriBotTimeOnly } from "@/lib/time";

type ProcessStep = { id: string; title: string; detail?: string };
const STEPS: ProcessStep[] = [
  { id: "power", title: "POWER ON" }, { id: "start", title: "ESP32 STARTS" },
  { id: "stop3", title: "STOP FOR 3 SEC" }, { id: "reverse", title: "REVERSE / MOVE" },
  { id: "ultrasonic", title: "ULTRASONIC SENSOR", detail: "Check distance" },
  { id: "obstacle", title: "OBSTACLE < 15 CM?", detail: "Wait for obstacle" },
  { id: "motor-stop", title: "MOTOR STOP" }, { id: "servo90", title: "SERVO → 90°" },
  { id: "wait5", title: "WAIT 5 SECONDS" }, { id: "soil", title: "READ SOIL MOISTURE" },
  { id: "soil-check", title: "SOIL < 30%?" }, { id: "pump", title: "PUMP ON / WATER 5 SEC" },
  { id: "recheck", title: "READ SOIL AGAIN" }, { id: "pump-off", title: "PUMP OFF" },
  { id: "servo0", title: "SERVO → 0°" }, { id: "forward", title: "FORWARD 3 SEC" },
  { id: "done", title: "MOTOR STOP / DONE" },
];

function modeOf(status: string | null, soil: number | null, relay: boolean | null) {
  const s = (status || "").toUpperCase();
  if (s.includes("WATERING") || relay) return "watering";
  if (s.includes("FORWARD")) return "forward";
  if (s.includes("REVERSE")) return "reverse";
  if (s.includes("OBSTACLE")) return "obstacle";
  if (s.includes("SERVO")) return "servo";
  if (soil != null && soil < 30) return "dry";
  if (s.includes("STOP")) return "stopped";
  return "waiting";
}

function activeStep(r: SensorReading | null, l: AgriBotLogRow | null) {
  const status = (r?.status || l?.status || "").trim();
  const s = status.toUpperCase();
  const soil = r?.soil_moisture ?? l?.soil_pct ?? null;
  const distance = r?.distance_cm ?? l?.distance_cm ?? null;
  const relay = r?.relay ?? l?.relay ?? false;

  // Map the ESP32 status messages to the actual firmware sequence.
  // The returned index is the real current step in STEPS.
  if (/PROCESS COMPLETE|DONE|FINAL STOP|MOTOR STOP.*DONE|SYSTEM STOPPED/.test(s)) return 16;
  if (/FORWARD/.test(s)) return 15;
  if (/SERVO.*0|SERVO.*HOME/.test(s)) return 14;
  if (/PUMP OFF|WATERING END|SOIL OK|TIMEOUT/.test(s)) return 13;
  if (/READ SOIL AGAIN|RECHECK/.test(s)) return 12;
  if (/WATERING|PUMP ON/.test(s) || relay) return 11;
  if (/SOIL.*30|DRY|READ SOIL|SOIL MOISTURE/.test(s) || (soil != null && soil < 30)) return 10;
  if (/WAIT.*5|5.*SEC/.test(s)) return 8;
  if (/SERVO.*90/.test(s)) return 7;
  if (/MOTOR STOP|OBSTACLE/.test(s) && distance != null && distance < 15) return 6;
  if (/OBSTACLE/.test(s) || (distance != null && distance < 15)) return 5;
  if (/ULTRASONIC|DISTANCE/.test(s)) return 4;
  if (/REVERSE/.test(s)) return 3;
  if (/STOP.*3|3.*SEC/.test(s)) return 2;
  if (/ESP32|START|POWER/.test(s)) return 1;
  return 2;
}

function timeOf(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ProcessClient() {
  const supabase = useMemo(() => createClient(), []);
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [log, setLog] = useState<AgriBotLogRow | null>(null);
  const [sensorCount, setSensorCount] = useState(0);
  const [logCount, setLogCount] = useState(0);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  const refresh = useCallback(async () => {
    const [sr, lr, sc, lc] = await Promise.all([
      supabase.from("agribot_sensor_data").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("agribot_log").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("agribot_sensor_data").select("id", { count: "exact", head: true }),
      supabase.from("agribot_log").select("id", { count: "exact", head: true }),
    ]);
    if (sr.data) setReading(sr.data as SensorReading);
    if (lr.data) setLog(lr.data as AgriBotLogRow);
    setSensorCount(sc.count || 0);
    setLogCount(lc.count || 0);
    const newest = [sr.data?.created_at, lr.data?.created_at].filter(Boolean).sort().at(-1) || null;
    setLastSeen(newest);
    setDemoMode(!sr.data && !lr.data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    refresh();
    const channel = supabase.channel("agribot-process-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agribot_sensor_data" }, (p) => {
        const row = p.new as SensorReading;
        setReading(row); setLastSeen(row.created_at); setSensorCount((n) => n + 1);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agribot_log" }, (p) => {
        const row = p.new as AgriBotLogRow;
        setLog(row); setLastSeen(row.created_at); setLogCount((n) => n + 1);
      }).subscribe();
    const timer = window.setInterval(refresh, 10000);
    return () => { window.clearInterval(timer); supabase.removeChannel(channel); };
  }, [refresh, supabase]);

  const demoSoil = 28;
  const demoDistance = 5;
  const demoTemperature = 32.5;
  const demoHumidity = 71.5;
  const demoRelay = true;
  const demoMotor = "STOPPED";
  const demoStatus = "Soil DRY - WATERING 6/24";
  const soil = reading?.soil_moisture ?? log?.soil_pct ?? (demoMode ? demoSoil : null);
  const distance = reading?.distance_cm ?? log?.distance_cm ?? (demoMode ? demoDistance : null);
  const temperature = reading?.temperature ?? log?.temp_c ?? (demoMode ? demoTemperature : null);
  const humidity = reading?.humidity ?? log?.hum_pct ?? (demoMode ? demoHumidity : null);
  const relay = reading?.relay ?? log?.relay ?? (demoMode ? demoRelay : false);
  const motor = reading?.motor ?? log?.motor ?? (demoMode ? demoMotor : "—");
  const status = reading?.status ?? log?.status ?? (demoMode ? demoStatus : "WAITING FOR ESP32");
  const cycle = status.match(/WATERING\s+(\d+)\s*\/\s*(\d+)/i);
  const live = !demoMode && !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 30000;
  const current = activeStep(reading, log);

  return (
    <DashboardShell title="AgriBot Process" subtitle="Live autonomous watering sequence">
      {demoMode && <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20"><p className="text-sm font-bold text-amber-800 dark:text-amber-300">DEMO PROCESS</p><p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Sample autonomous watering data for presentation. Live ESP32 readings will replace these values automatically.</p></div>}

      <div className="mb-4 flex items-start justify-between gap-3">
        <div><h2 className="text-xl font-extrabold tracking-tight text-foreground dark:text-gray-100">Autonomous Process</h2>
          <p className="mt-1 text-xs text-muted dark:text-gray-400">{demoMode ? "Demo process sequence — sample values are shown until the ESP32 sends live data." : "Live flow from the ESP32 data in Supabase."}</p></div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold dark:border-gray-800 dark:bg-gray-900">
          <span className={"h-2 w-2 rounded-full " + (live ? "bg-green-500" : "bg-gray-400")} />{demoMode ? "DEMO" : live ? "LIVE" : "WAITING"}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Soil" value={soil == null ? "—" : soil.toFixed(0) + "%"} icon={<Sprout className="h-4 w-4" />} />
        <Metric label="Distance" value={distance == null ? "—" : distance.toFixed(0) + " cm"} icon={<Waves className="h-4 w-4" />} />
        <Metric label="Pump" value={relay ? "ON" : "OFF"} icon={<Droplets className="h-4 w-4" />} />
        <Metric label="Motor" value={motor} icon={<Gauge className="h-4 w-4" />} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Metric label="Temperature" value={temperature == null ? "—" : temperature.toFixed(1) + "°C"} icon={<Timer className="h-4 w-4" />} />
        <Metric label="Humidity" value={humidity == null ? "—" : humidity.toFixed(1) + "%"} icon={<Radio className="h-4 w-4" />} />
        <Metric label="Watering Cycle" value={cycle ? cycle[1] + " / " + cycle[2] : "—"} icon={<RotateCw className="h-4 w-4" />} />
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <div><h3 className="font-bold text-foreground dark:text-gray-100">Process Flow</h3>
            <p className="text-xs text-muted dark:text-gray-400">Current state: {status}</p></div>
          {!demoMode && <div className="text-right text-[11px] text-muted dark:text-gray-400"><div>Sensor rows: {sensorCount}</div><div>Log rows: {logCount}</div></div>}
        </div>
        <div className="space-y-2">
          {STEPS.map((step, index) => {
            const state = index < current ? "done" : index === current ? "active" : "pending";
            return <div key={step.id}>
              <div className={"flex items-center gap-3 rounded-xl border px-3 py-3 transition-all " +
                (state === "active" ? "border-primary bg-primary/10 shadow-sm" :
                 state === "done" ? "border-green-200 bg-green-50/70 dark:border-green-900 dark:bg-green-950/20" :
                 "border-border bg-surface/50 dark:border-gray-800 dark:bg-gray-950/30")}>
                {state === "done" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" /> :
                 state === "active" ? <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">●</span> :
                 <Circle className="h-5 w-5 shrink-0 text-muted" />}
                <div className="min-w-0 flex-1"><div className="text-sm font-bold text-foreground dark:text-gray-100">{step.title}</div>
                  {step.detail && <div className="text-[11px] text-muted dark:text-gray-400">{step.detail}</div>}</div>
                {state === "active" && <span className="rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-white">ACTIVE</span>}
              </div>
              {index < STEPS.length - 1 && <div className="mx-5 h-2 border-l border-dashed border-border dark:border-gray-700" />}
            </div>;
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <InfoCard title="Latest sensor reading" time={formatAgriBotTimeOnly(reading?.created_at)}
          body={"Soil " + (soil == null ? "—" : soil.toFixed(0) + "%") + " · Distance " + (distance == null ? "—" : distance.toFixed(0) + " cm") + " · Pump " + (relay ? "ON" : "OFF")} />
        <InfoCard title="Latest process log" time={formatAgriBotTimeOnly(log?.created_at)} body={log?.status || "No process log yet"} />
      </div>
      {loading && <p className="mt-4 text-center text-xs text-muted dark:text-gray-400">Loading live process data…</p>}
    </DashboardShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
    <div className="flex items-center gap-2 text-xs text-muted dark:text-gray-400">{icon}{label}</div>
    <div className="mt-1 truncate text-lg font-extrabold text-foreground dark:text-gray-100">{value}</div>
  </div>;
}
function InfoCard({ title, time, body }: { title: string; time: string; body: string }) {
  return <div className="rounded-xl border border-border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
    <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-bold text-foreground dark:text-gray-100">{title}</h4><span className="text-[11px] text-muted dark:text-gray-400">{time}</span></div>
    <p className="mt-2 text-xs text-muted dark:text-gray-400">{body}</p>
  </div>;
}
