"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PlantLocation } from "@/lib/types";

type PlantWithReading = PlantLocation & {
  soilMoisture: number | null;
  readingAt: string | null;
};

function moistureColor(soil: number | null) {
  if (soil == null) return "#9ca3af";
  if (soil < 30) return "#dc2626";
  if (soil < 55) return "#d97706";
  return "#16a34a";
}

function plantPinIcon(plant: PlantWithReading) {
  const color = moistureColor(plant.soilMoisture);
  const label = plant.soilMoisture != null ? `${plant.soilMoisture.toFixed(0)}%` : "—";
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
      <div style="background:white;border-radius:9999px;padding:1px 6px;font:700 10px sans-serif;color:#111;box-shadow:0 1px 3px rgba(0,0,0,0.25);margin-bottom:2px;">${label}</div>
      <div style="width:28px;height:28px;border-radius:9999px 9999px 9999px 2px;transform:rotate(-45deg);
        background:${color};box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid white;
        display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);color:white;font:700 11px sans-serif;">#${plant.plant_index}</span>
      </div>
    </div>`,
    iconSize: [32, 44],
    iconAnchor: [16, 44],
  });
}

function FitToPlants({ plants }: { plants: PlantWithReading[] }) {
  const map = useMap();
  useMemo(() => {
    if (plants.length === 0) return;
    if (plants.length === 1) {
      map.setView([plants[0].latitude, plants[0].longitude], 18);
      return;
    }
    const bounds = L.latLngBounds(plants.map((p) => [p.latitude, p.longitude] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plants.length]);
  return null;
}

export function PlantsMap({
  plants,
  onWater,
  sendingIndex,
}: {
  plants: PlantWithReading[];
  onWater: (plantIndex: number) => void;
  sendingIndex: number | null;
}) {
  const center: [number, number] =
    plants.length > 0 ? [plants[0].latitude, plants[0].longitude] : [11.0168, 76.9558]; // Coimbatore fallback

  return (
    <MapContainer center={center} zoom={17} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToPlants plants={plants} />
      {plants.map((p) => (
        <Marker key={p.id} position={[p.latitude, p.longitude]} icon={plantPinIcon(p)}>
          <Popup>
            <div className="min-w-[160px]">
              <p className="font-semibold text-foreground">Plant {p.plant_index}</p>
              <p className="text-xs text-muted">
                {p.soilMoisture != null ? `Soil: ${p.soilMoisture.toFixed(0)}%` : "No soil reading yet"}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => onWater(p.plant_index)}
                  disabled={sendingIndex === p.plant_index}
                  className="text-xs font-medium text-primary underline disabled:opacity-50"
                >
                  {sendingIndex === p.plant_index ? "Sending…" : "Send robot here"}
                </button>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-indigo-600 underline"
                >
                  Directions
                </a>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
    }
