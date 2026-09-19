"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, StatusBadge } from "@/components/ui-kit";
import { PlantsMapLoader } from "@/components/plants-map-loader";
import type { PlantLocation, SensorReading } from "@/lib/types";
import { MapPin, Droplets, Navigation, ExternalLink, History, FlaskConical } from "lucide-react";

const ROBOT_ID = "agribot-01";

type PlantWithReading = PlantLocation & {
  soilMoisture: number | null;
  readingAt: string | null;
};
const DEMO_PLANTS: PlantWithReading[] = [
  { id: -1, created_at: "2026-09-19T15:30:00Z", robot_id: ROBOT_ID, plant_index: 1, latitude: 11.01695, longitude: 76.95585, soilMoisture: 42, readingAt: null },
  { id: -2, created_at: "2026-09-19T15:30:00Z", robot_id: ROBOT_ID, plant_index: 2, latitude: 11.01720, longitude: 76.95615, soilMoisture: 28, readingAt: null },
  { id: -3, created_at: "2026-09-19T15:30:00Z", robot_id: ROBOT_ID, plant_index: 3, latitude: 11.01665, longitude: 76.95635, soilMoisture: 61, readingAt: null },
  { id: -4, created_at: "2026-09-19T15:30:00Z", robot_id: ROBOT_ID, plant_index: 4, latitude: 11.01645, longitude: 76.95565, soilMoisture: 35, readingAt: null },
];

export default function PlantsClient() {
  const supabase = createClient();
  const [plants, setPlants] = useState<PlantWithReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<number | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  const load = useCallback(async () => {
    const [{ data: locations }, { data: readings }] = await Promise.all([
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

    if (merged.length === 0) {
      setPlants(DEMO_PLANTS);
      setDemoMode(true);
    } else {
      setPlants(merged);
      setDemoMode(false);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("plants-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plant_locations" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agribot_sensor_data" },
        () => load()
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

  return (
    <DashboardShell title="Plant Locations" subtitle={demoMode ? `Demo field · ${ROBOT_ID}` : `${plants.length} saved · ${ROBOT_ID}`}>
      {demoMode && (
        <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">DEMO PLANT LOCATIONS</p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">Sample Coimbatore field coordinates and soil readings are shown until the robot saves real GPS plant locations.</p>
            </div>
          </div>
        </div>
      )}
      <Card className="overflow-hidden p-0">
        <div className="h-[340px] w-full">
          <PlantsMapLoader plants={plants} onWater={demoMode ? undefined : waterNow} sendingIndex={demoMode ? null : sending} />
        </div>
        <div className="flex items-center justify-center gap-4 border-t border-border px-3 py-2 text-[11px] text-muted dark:border-gray-800 dark:text-gray-400">
          <Legend color="#16a34a" label="Wet" />
          <Legend color="#d97706" label="Getting dry" />
          <Legend color="#dc2626" label="Needs water" />
          <Legend color="#9ca3af" label="No reading" />
        </div>
      </Card>

      <div className="mt-4 space-y-2">
        {plants.map((p) => (
          <PlantRow key={p.id} plant={p} sending={sending === p.plant_index} onWater={waterNow} demo={demoMode} />
        ))}
      </div>
    </DashboardShell>
  );
}

function moistureColor(soil: number | null) {
  if (soil == null) return "#9ca3af";
  if (soil < 30) return "#dc2626";
  if (soil < 55) return "#d97706";
  return "#16a34a";
}

function PlantRow({
  plant,
  sending,
  onWater,
}: {
  plant: PlantWithReading;
  sending: boolean;
  onWater: (plantIndex: number) => void;
  demo?: boolean;
}) {
  const color = moistureColor(plant.soilMoisture);
  const dry = plant.soilMoisture != null && plant.soilMoisture < 30;

  return (
    <Card className="flex items-center gap-3 p-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
        style={{ backgroundColor: color }}
      >
        <Droplets className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground dark:text-gray-100">
            Plant {plant.plant_index}
          </span>
          {dry && <StatusBadge label="Needs water" tone="danger" dot={false} />}
        </div>
        <p className="truncate text-[11px] text-muted dark:text-gray-400">
          {plant.latitude.toFixed(5)}, {plant.longitude.toFixed(5)}
          {plant.readingAt && ` · ${new Date(plant.readingAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
          {!plant.readingAt && " · Sample reading"}
        </p>
      </div>
      {!demo && <button
        onClick={() => onWater(plant.plant_index)}
        disabled={sending}
        className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition active:scale-95 disabled:opacity-50"
      >
        <Navigation className="h-3 w-3" />
        {sending ? "Sending…" : "Go"}
      </button>}
      <a
        href={`https://www.google.com/maps?q=${plant.latitude},${plant.longitude}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-muted dark:text-gray-400"
        aria-label="Open in Google Maps"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
      <Link
        href={`/plants/${plant.plant_index}`}
        className="shrink-0 text-muted dark:text-gray-400"
        aria-label="View plant history"
      >
        <History className="h-4 w-4" />
      </Link>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}


