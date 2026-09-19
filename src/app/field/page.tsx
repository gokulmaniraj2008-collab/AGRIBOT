"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card } from "@/components/ui-kit";
import { PlantsMapLoader } from "@/components/plants-map-loader";
import type { SensorReading, PlantLocation } from "@/lib/types";
import { formatAgriBotTime } from "@/lib/time";
import { Map as MapIcon, MapPin, Gauge, Battery, Power, Droplets, Thermometer, Wind, Ruler } from "lucide-react";
import Link from "next/link";

const ROBOT_ID = "agribot-01";

type PlantWithReading = PlantLocation & {
  soilMoisture: number | null;
  readingAt: string | null;
};

export default function FieldPage() {
  const supabase = createClient();
  const [latest, setLatest] = useState<SensorReading | null>(null);
  const [plants, setPlants] = useState<PlantWithReading[]>([]);

  const load = useCallback(async () => {
    const [{ data: latestRow }, { data: locations }, { data: readings }] = await Promise.all([
      supabase
        .from("agribot_sensor_data")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SensorReading>(),
      supabase
        .from("plant_locations")
        .select("*")
        .eq("robot_id", ROBOT_ID)
        .order("plant_index", { ascending: true })
        .returns<PlantLocation[]>(),
      supabase
        .from("agribot_sensor_data")
        .select("plant_index, soil_moisture, created_at")
        .not("plant_index", "is", null)
        .order("created_at", { ascending: false })
        .limit(200)
        .returns<Pick<SensorReading, "plant_index" | "soil_moisture" | "created_at">[]>(),
    ]);

    if (latestRow) setLatest(latestRow);

    const latestByPlant = new Map<number, { soil: number | null; at: string }>();
    for (const reading of readings ?? []) {
      if (reading.plant_index == null) continue;
      if (!latestByPlant.has(reading.plant_index)) {
        latestByPlant.set(reading.plant_index, {
          soil: reading.soil_moisture,
          at: reading.created_at,
        });
      }
    }

    setPlants(
      (locations ?? []).map((plant) => ({
        ...plant,
        soilMoisture: latestByPlant.get(plant.plant_index)?.soil ?? null,
        readingAt: latestByPlant.get(plant.plant_index)?.at ?? null,
      }))
    );
  }, [supabase]);

  useEffect(() => {
    load();

    const channel = supabase
      .channel("field_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agribot_sensor_data" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plant_locations" },
        () => load()
      )
      .subscribe();

    const timer = window.setInterval(load, 10000);

    return () => {
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const robotHasGps = latest?.latitude != null && latest?.longitude != null;
  const robotMarker = robotHasGps
    ? {
        latitude: latest.latitude!,
        longitude: latest.longitude!,
        online: true,
      }
    : null;

  const demoMode = plants.length === 0 && !robotHasGps;
  const displayPlants = plants.length > 0 ? plants : demoMode ? DEMO_PLANTS : [];
  const displayRobot = robotMarker ?? (demoMode ? DEMO_ROBOT : null);
  const hasAnyMap = displayPlants.length > 0 || !!displayRobot;
  const soil = latest?.soil_moisture;
  const isWatering = latest?.relay === true;
  const statusText = latest?.status ?? "Waiting for sensor data";

  return (
    <DashboardShell title="Farm" subtitle="agribot-01">
      <>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FarmMetric icon={Droplets} label="Soil" value={soil != null ? `${soil.toFixed(0)}%` : "—"} />
          <FarmMetric icon={Thermometer} label="Temperature" value={latest?.temperature != null ? `${latest.temperature.toFixed(1)}°C` : "—"} />
          <FarmMetric icon={Wind} label="Humidity" value={latest?.humidity != null ? `${latest.humidity.toFixed(1)}%` : "—"} />
          <FarmMetric icon={Ruler} label="Distance" value={latest?.distance_cm != null ? `${latest.distance_cm.toFixed(0)} cm` : "—"} />
        </div>

        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground dark:text-gray-100">Live Farm Status</p>
              <p className="mt-1 text-xs text-muted dark:text-gray-400">{statusText}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <StatusPill label="Pump" value={isWatering ? "ON" : "OFF"} active={isWatering} />
              <StatusPill label="Motor" value={latest?.motor ?? "—"} active={false} />
              <StatusPill label="Battery" value={latest?.battery_percent != null ? `${latest.battery_percent.toFixed(0)}%` : "—"} active={false} />
            </div>
          </div>
          {latest && (
            <p className="mt-3 text-[11px] text-muted dark:text-gray-400">
              Latest reading: {formatAgriBotTime(latest.created_at)}
            </p>
          )}
        </Card>

        <Link
          href="/plants"
          className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <span className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MapPin className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground dark:text-gray-100">Plant Locations</span>
              <span className="block text-xs text-muted dark:text-gray-400">
                {plants.length > 0 ? `${plants.length} saved spot${plants.length === 1 ? "" : "s"} — shown on the map below` : "Demo field with sample plant locations — waiting for real GPS data"}
              </span>
            </span>
          </span>
        </Link>

        {hasAnyMap ? (
          <Card className="overflow-hidden p-0">
            <div className="h-64 w-full">
              <PlantsMapLoader plants={displayPlants} onWater={() => {}} sendingIndex={null} robot={displayRobot} />
            </div>
          </Card>
        ) : (
          <Card className="p-6 text-center">
            <MapIcon className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-2 text-sm font-semibold text-foreground dark:text-gray-100">Farm map waiting for GPS</p>
            <p className="mt-1 text-xs text-muted dark:text-gray-400">Save a plant location or send GPS coordinates from the robot to show the live farm map.</p>
          </Card>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FarmMetric icon={Gauge} label="Robot state" value={latest?.motor ?? "—"} />
          <FarmMetric icon={Power} label="Relay" value={latest?.relay == null ? "—" : latest.relay ? "ON" : "OFF"} />
          <FarmMetric icon={Battery} label="Battery voltage" value={latest?.battery_voltage != null ? `${latest.battery_voltage.toFixed(2)}V` : "—"} />
          <FarmMetric icon={Droplets} label="Watering status" value={isWatering ? "Watering" : "Idle"} />
        </div>
      </>
    </DashboardShell>
  );
}

function FarmMetric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card className="p-3">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-2 text-lg font-semibold text-foreground dark:text-gray-100">{value}</p>
      <p className="text-[11px] text-muted dark:text-gray-400">{label}</p>
    </Card>
  );
}

function StatusPill({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 ${active ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted dark:border-gray-700 dark:text-gray-400"}`}>
      {label}: {value}
    </span>
  );
}
