"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, StatusBadge } from "@/components/ui-kit";
import ComingSoon from "@/components/coming-soon";
import { PlantsMapLoader } from "@/components/plants-map-loader";
import type { PlantLocation, SensorReading } from "@/lib/types";
import { MapPin, Droplets, Navigation, ExternalLink } from "lucide-react";

const ROBOT_ID = "agribot-01";

type PlantWithReading = PlantLocation & {
  soilMoisture: number | null;
  readingAt: string | null;
};

export default function PlantsClient() {
  const supabase = createClient();
  const [plants, setPlants] = useState<PlantWithReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [{ data: locations }, { data: readings }] = await Promise.all([
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
        { event: "INSERT", schema: "public", table: "sensor_data" },
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

  if (!loading && plants.length === 0) {
    return (
      <DashboardShell title="Plant Locations" subtitle={ROBOT_ID}>
        <ComingSoon
          icon={MapPin}
          title="No saved plant locations yet"
          description='Send a "save_plant_location" command (or tap Save Location on the Robot page) at each plant to start building this map.'
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Plant Locations" subtitle={`${plants.length} saved · ${ROBOT_ID}`}>
      <Card className="overflow-hidden p-0">
        <div className="h-[340px] w-full">
          <PlantsMapLoader plants={plants} onWater={waterNow} sendingIndex={sending} />
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
          <PlantRow key={p.id} plant={p} sending={sending === p.plant_index} onWater={waterNow} />
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
        </p>
      </div>
      <button
        onClick={() => onWater(plant.plant_index)}
        disabled={sending}
        className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition active:scale-95 disabled:opacity-50"
      >
        <Navigation className="h-3 w-3" />
        {sending ? "Sending…" : "Go"}
      </button>
      <a
        href={`https://www.google.com/maps?q=${plant.latitude},${plant.longitude}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-muted dark:text-gray-400"
        aria-label="Open in Google Maps"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
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

                                           
