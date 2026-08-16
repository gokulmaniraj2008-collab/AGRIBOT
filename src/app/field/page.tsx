"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card } from "@/components/ui-kit";
import ComingSoon from "@/components/coming-soon";
import { PlantsMapLoader } from "@/components/plants-map-loader";
import type { RobotStatus, SensorReading, PlantLocation } from "@/lib/types";
import { Map as MapIcon, MapPin, Gauge, Battery, Power, ChevronRight } from "lucide-react";
import Link from "next/link";

const ROBOT_ID = "agribot-01";

type PlantWithReading = PlantLocation & {
  soilMoisture: number | null;
  readingAt: string | null;
};

export default function FieldPage() {
  const supabase = createClient();
  const [latest, setLatest] = useState<SensorReading | null>(null);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [plants, setPlants] = useState<PlantWithReading[]>([]);
  const [sending, setSending] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [{ data: latestRow }, { data: statusRow }, { data: locations }, { data: readings }] =
      await Promise.all([
        supabase
          .from("sensor_data")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<SensorReading>(),
        supabase.from("robot_status").select("*").eq("robot_id", ROBOT_ID).single<RobotStatus>(),
        supabase
          .from("plant_locations")
          .select("*")
          .eq("robot_id", ROBOT_ID)
          .order("plant_index", { ascending: true })
          .returns<PlantLocation[]>(),
        supabase
          .from("sensor_data")
          .select("plant_index, soil_moisture, created_at")
          .not("plant_index", "is", null)
          .order("created_at", { ascending: false })
          .limit(200)
          .returns<Pick<SensorReading, "plant_index" | "soil_moisture" | "created_at">[]>(),
      ]);

    if (latestRow) setLatest(latestRow);
    if (statusRow) setStatus(statusRow);

    const latestByPlant = new Map<number, { soil: number | null; at: string }>();
    for (const r of readings ?? []) {
      if (r.plant_index == null) continue;
      if (!latestByPlant.has(r.plant_index)) {
        latestByPlant.set(r.plant_index, { soil: r.soil_moisture, at: r.created_at });
      }
    }
    const merged: PlantWithReading[] = (locations ?? []).map((p) => ({
      ...p,
      soilMoisture: latestByPlant.get(p.plant_index)?.soil ?? null,
      readingAt: latestByPlant.get(p.plant_index)?.at ?? null,
    }));
    setPlants(merged);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("field_map_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "plant_locations" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sensor_data" }, () => load())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "robot_status", filter: `robot_id=eq.${ROBOT_ID}` },
        (payload) => setStatus(payload.new as RobotStatus)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const waterNow = useCallback(async (plantIndex: number) => {
    setSending(plantIndex);
    try {
      await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "goto_plant", value: plantIndex }),
      });
    } finally {
      setSending(null);
    }
  }, []);

  const robotHasGps = latest?.latitude != null && latest?.longitude != null;
  const isOnline =
    !!status?.online &&
    !!status?.updated_at &&
    Date.now() - new Date(status.updated_at).getTime() < 30_000;

  const robotMarker = robotHasGps
    ? { latitude: latest!.latitude!, longitude: latest!.longitude!, online: isOnline }
    : null;

  const hasAnyMap = plants.length > 0 || robotHasGps;

  return (
    <DashboardShell title="Field Map" subtitle="agribot-01">
      <>
        <Link
          href="/plants"
          className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <span className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MapPin className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground dark:text-gray-100">
                Plant Locations
              </span>
              <span className="block text-xs text-muted dark:text-gray-400">
                {plants.length > 0
                  ? `${plants.length} saved spot${plants.length === 1 ? "" : "s"} — shown on the map below`
                  : "See every saved plant spot and its soil moisture"}
              </span>
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted dark:text-gray-400" />
        </Link>

        {hasAnyMap ? (
          <Card className="overflow-hidden p-0">
            <div className="h-64 w-full">
              <PlantsMapLoader plants={plants} onWater={waterNow} sendingIndex={sending} robot={robotMarker} />
            </div>
            <div className="grid grid-cols-3 divide-x divide-border p-3 text-center dark:divide-gray-800">
              <TelemetryCell icon={Gauge} label="Speed" value={status ? `${status.speed_value}` : "—"} />
              <TelemetryCell
                icon={Battery}
                label="Battery"
                value={latest?.battery_percent != null ? `${latest.battery_percent.toFixed(0)}%` : "—"}
              />
              <TelemetryCell icon={Power} label="Mode" value={status?.mode === "auto" ? "Auto" : "Manual"} />
            </div>
            {latest && (
              <p className="border-t border-border px-3 py-2 text-center text-[11px] text-muted dark:border-gray-800 dark:text-gray-400">
                Robot position as of{" "}
                {new Date(latest.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </Card>
        ) : (
          <ComingSoon
            icon={MapIcon}
            title="Field map coming soon"
            description="Save at least one plant location, or get a GPS fix on the robot, and the map will appear here."
          />
        )}

        <section className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <span className="text-sm font-semibold text-foreground dark:text-gray-100">
            Zone Health (preview)
          </span>
          <p className="mt-1 text-xs text-muted dark:text-gray-400">
            Per-zone health scoring will populate here once the robot has covered the field and
            reported readings per sector — needs a zone/sector table, not yet in the schema.
          </p>
          <div className="mt-3 flex gap-3 text-xs">
            <Legend color="bg-primary" label="Healthy" />
            <Legend color="bg-warning" label="Moderate" />
            <Legend color="bg-danger" label="Poor" />
          </div>
        </section>
      </>
    </DashboardShell>
  );
}

function TelemetryCell({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-2">
      <Icon className="h-3.5 w-3.5 text-primary" />
      <span className="text-xs font-semibold text-foreground dark:text-gray-100">{value}</span>
      <span className="text-[10px] text-muted dark:text-gray-400">{label}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted dark:text-gray-400">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
    }
            
