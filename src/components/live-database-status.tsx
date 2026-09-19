"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgriBotLogRow, SensorReading } from "@/lib/types";

function utc(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted dark:text-gray-400">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-foreground dark:text-gray-100">{value}</p>
    </div>
  );
}

export default function LiveDatabaseStatus() {
  const supabase = createClient();
  const [sensorRows, setSensorRows] = useState(0);
  const [logRows, setLogRows] = useState(0);
  const [latest, setLatest] = useState<SensorReading | null>(null);
  const [latestLog, setLatestLog] = useState<AgriBotLogRow | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [{ data: sensor }, { data: log }, sensorCount, logCount] = await Promise.all([
        supabase.from("agribot_sensor_data").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle<SensorReading>(),
        supabase.from("agribot_log").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle<AgriBotLogRow>(),
        supabase.from("agribot_sensor_data").select("*", { count: "exact", head: true }),
        supabase.from("agribot_log").select("*", { count: "exact", head: true }),
      ]);

      if (!mounted) return;
      if (sensor) setLatest(sensor);
      if (log) setLatestLog(log);
      setSensorRows(sensorCount.count ?? 0);
      setLogRows(logCount.count ?? 0);
    }

    load();

    const sensorChannel = supabase
      .channel("live_database_sensor")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agribot_sensor_data" }, (payload) => {
        setLatest(payload.new as SensorReading);
        setSensorRows((n) => n + 1);
      })
      .subscribe();

    const logChannel = supabase
      .channel("live_database_log")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agribot_log" }, (payload) => {
        setLatestLog(payload.new as AgriBotLogRow);
        setLogRows((n) => n + 1);
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(sensorChannel);
      supabase.removeChannel(logChannel);
    };
  }, [supabase]);

  const isLive = !!latest && Date.now() - new Date(latest.created_at).getTime() < 30000;

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-primary/20 bg-white shadow-sm dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Live Database Status</p>
          <p className="mt-0.5 text-[11px] text-muted dark:text-gray-400">Directly synced from Supabase</p>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-[10px] font-bold">
          {isLive ? "LIVE" : "WAITING"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
        <div className="bg-white px-3 py-3 dark:bg-gray-900"><p className="text-[10px] text-muted">agribot_sensor_data</p><p className="mt-1 text-sm font-bold">{sensorRows} rows</p></div>
        <div className="bg-white px-3 py-3 dark:bg-gray-900"><p className="text-[10px] text-muted">agribot_log</p><p className="mt-1 text-sm font-bold">{logRows} rows</p></div>
        <div className="bg-white px-3 py-3 dark:bg-gray-900"><p className="text-[10px] text-muted">Latest sensor reading</p><p className="mt-1 text-sm font-bold">{utc(latest?.created_at)} UTC</p></div>
        <div className="bg-white px-3 py-3 dark:bg-gray-900"><p className="text-[10px] text-muted">Latest history record</p><p className="mt-1 text-sm font-bold">{utc(latestLog?.created_at)} UTC</p></div>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-7">
        <Value label="Soil" value={latest?.soil_moisture == null ? "—" : latest.soil_moisture.toFixed(0) + "%"} />
        <Value label="Temperature" value={latest?.temperature == null ? "—" : latest.temperature.toFixed(1) + "°C"} />
        <Value label="Humidity" value={latest?.humidity == null ? "—" : latest.humidity.toFixed(1) + "%"} />
        <Value label="Distance" value={latest?.distance_cm == null ? "—" : latest.distance_cm.toFixed(0) + " cm"} />
        <Value label="Motor" value={latest?.motor ?? "—"} />
        <Value label="Relay" value={latest?.relay == null ? "—" : latest.relay ? "ON" : "OFF"} />
        <Value label="Status" value={latest?.status ?? latestLog?.status ?? "—"} />
      </div>
    </section>
  );
}
