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

function robotPinIcon(online: boolean) {
  const color = online ? "#0ea5e9" : "#9ca3af";
  return L.divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;border-radius:9999px;background:${color};
      box-shadow:0 2px 8px rgba(0,0,0,0.35);border:3px solid white;
      display:flex;align-items:center;justify-content:center;">
      <span style="color:white;font:700 13px sans-serif;">R</span>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function FitToPlants({
  plants,
  robot,
}: {
  plants: PlantWithReading[];
  robot?: { latitude: number; longitude: number } | null;
}) {
  const map = useMap();
  useMemo(() => {
    const points: [number, number][] = plants.map((p) => [p.latitude, p.longitude]);
    if (robot) points.push([robot.latitude, robot.longitude]);
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 18);
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plants.length, robot?.latitude, robot?.longitude]);
  return null;
}

export function PlantsMap({
  plants,
  onWater,
  sendingIndex,
  robot,
}: {
  plants: PlantWithReading[];
  onWater: (plantIndex: number) => void;
  sendingIndex: number | null;
  robot?: { latitude: number; longitude: number; online: boolean } | null;
}) {
  const center: [number, number] =
    plants.length > 0
      ? [plants[0].latitude, plants[0].longitude]
      : robot
      ? [robot.latitude, robot.longitude]
      : [11.0168, 76.9558]; // Coimbatore fallback

  return (
    <MapContainer center={center} zoom={17} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToPlants plants={plants} robot={robot} />
      {robot && (
        <Marker position={[robot.latitude, robot.longitude]} icon={robotPinIcon(robot.online)}>
          <Popup>
            <p className="text-xs font-semibold text-foreground">AgriBot AI — Unit 01</p>
            <p className="text-xs text-muted">{robot.online ? "Online" : "Offline"}</p>
          </Popup>
        </Marker>
      )}
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
