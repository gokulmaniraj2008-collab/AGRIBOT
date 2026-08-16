"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card } from "@/components/ui-kit";
import ComingSoon from "@/components/coming-soon";
import type { MissionPlant, PlantLocation } from "@/lib/types";
import {
  ArrowLeft,
  Camera,
  Check,
  Droplets,
  ExternalLink,
  MapPin,
  Navigation,
  Search,
  X,
} from "lucide-react";

const ROBOT_ID = "agribot-01";

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** One visit's checklist — what actually happened at this plant that time. */
function visitLines(v: MissionPlant): { ok: boolean; text: string }[] {
  if (v.status === "failed" || v.status === "skipped") {
    return [
      { ok: true, text: "Detected" },
      {
        ok: false,
        text:
          v.status === "skipped"
            ? `Skipped${v.failure_reason ? ` — ${v.failure_reason.replace(/_/g, " ")}` : ""}`
            : `Failed${v.failure_reason ? ` — ${v.failure_reason.replace(/_/g, " ")}` : ""}`,
      },
    ];
  }

  const lines: { ok: boolean; text: string }[] = [{ ok: true, text: "Detected" }];
  if (v.camera_verified) lines.push({ ok: true, text: "Camera verified" });
  if (v.soil_moisture != null) lines.push({ ok: true, text: `Soil measured: ${v.soil_moisture}%` });
  if (v.watered) {
    lines.push({
      ok: true,
      text: `Watered${v.water_duration_s != null ? `: ${v.water_duration_s}s` : ""}`,
    });
  } else if (v.soil_moisture != null) {
    lines.push({ ok: true, text: "No watering required" });
  }
  return lines;
}

export default function PlantHistoryPage() {
  const params = useParams<{ index: string }>();
  const plantIndex = Number(params.index);
  const supabase = createClient();

  const [visits, setVisits] = useState<MissionPlant[]>([]);
  const [location, setLocation] = useState<PlantLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(plantIndex)) return;
    let cancelled = false;
    (async () => {
      const [{ data: rows }, { data: loc }] = await Promise.all([
        supabase
          .from("mission_plants")
          .select("*")
          .eq("robot_id", ROBOT_ID)
          .eq("plant_index", plantIndex)
          .order("created_at", { ascending: false })
          .returns<MissionPlant[]>(),
        supabase
          .from("plant_locations")
          .select("*")
          .eq("robot_id", ROBOT_ID)
          .eq("plant_index", plantIndex)
          .maybeSingle<PlantLocation>(),
      ]);
      if (cancelled) return;
      setVisits(rows ?? []);
      setLocation(loc ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, plantIndex]);

  useEffect(() => {
    if (!Number.isFinite(plantIndex)) return;
    const channel = supabase
      .channel(`plant_history_${plantIndex}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mission_plants",
          filter: `plant_index=eq.${plantIndex}`,
        },
        (payload) => {
          const row = payload.new as MissionPlant;
          if (row.robot_id !== ROBOT_ID) return;
          setVisits((prev) => [row, ...prev.filter((v) => v.id !== row.id)]);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, plantIndex]);

  const waterNow = async () => {
    setSending(true);
    try {
      await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "goto_plant", value: plantIndex }),
      });
    } finally {
      setSending(false);
    }
  };

  // Group visits by calendar day, most recent day first (rows already
  // arrive newest-first from the query/realtime feed above).
  const groups: { day: string; visits: MissionPlant[] }[] = [];
  for (const v of visits) {
    const day = dayLabel(v.created_at);
    const g = groups.find((g) => g.day === day);
    if (g) g.visits.push(v);
    else groups.push({ day, visits: [v] });
  }

  if (!loading && visits.length === 0 && !location) {
    return (
      <DashboardShell title={`Plant #${plantIndex}`} subtitle={ROBOT_ID}>
        <ComingSoon
          icon={Search}
          title="No history yet"
          description="This plant hasn't been visited during a patrol yet. Its timeline will appear here once the robot reaches it."
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title={`Plant #${plantIndex}`} subtitle={`${visits.length} visit${visits.length === 1 ? "" : "s"} · ${ROBOT_ID}`}>
      <Link
        href="/plants"
        className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted dark:text-gray-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Plant Locations
      </Link>

      {location && (
        <Card className="flex items-center gap-3 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MapPin className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted dark:text-gray-400">
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            </p>
          </div>
          <button
            onClick={waterNow}
            disabled={sending}
            className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition active:scale-95 disabled:opacity-50"
          >
            <Navigation className="h-3 w-3" />
            {sending ? "Sending…" : "Go water"}
          </button>
          <a
            href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted dark:text-gray-400"
            aria-label="Open in Google Maps"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </Card>
      )}

      <div className="mt-4 space-y-5">
        {groups.map((g) => (
          <div key={g.day}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-400">
              {g.day}
            </p>
            <div className="space-y-2">
              {g.visits.map((v) => (
                <Card key={v.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground dark:text-gray-100">
                      <Droplets className="h-3.5 w-3.5 text-primary" />
                      {timeLabel(v.created_at)}
                    </span>
                    <span className="text-[11px] text-muted dark:text-gray-400">
                      Mission #{v.mission_id}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {visitLines(v).map((line, i) => (
                      <li
                        key={i}
                        className={`flex items-center gap-1.5 text-xs ${
                          line.ok ? "text-foreground dark:text-gray-200" : "text-danger"
                        }`}
                      >
                        {line.ok ? (
                          <Check className="h-3 w-3 shrink-0 text-primary" />
                        ) : (
                          <X className="h-3 w-3 shrink-0 text-danger" />
                        )}
                        {line.text}
                      </li>
                    ))}
                    {v.camera_verified === false && v.status !== "failed" && v.status !== "skipped" && (
                      <li className="flex items-center gap-1.5 text-xs text-muted dark:text-gray-400">
                        <Camera className="h-3 w-3 shrink-0" />
                        Camera did not verify this plant
                      </li>
                    )}
                  </ul>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
    }
     
