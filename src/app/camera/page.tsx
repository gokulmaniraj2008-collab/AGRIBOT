"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { createClient } from "@/lib/supabase/client";
import { Camera, Sparkles, ArrowRight, WifiOff } from "lucide-react";
import type { RobotStatus } from "@/lib/types";

// Same camera identity + staleness convention as /device — see the
// IDENTITY NOTE in esp32cam_supabase_upload.ino. CAM_ROBOT_ID is a
// separate robot_status row from the main "agribot-01" row.
const CAM_ROBOT_ID = "agribot-01-cam";
// Matches HEARTBEAT_INTERVAL_MS (5s) in the firmware with margin for
// ordinary network jitter, same value /device uses for its own
// heartbeat staleness check.
const HEARTBEAT_STALE_MS = 30_000;

export default function CameraPage() {
  const [cameraStatus, setCameraStatus] = useState<RobotStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const supabase = useRef(createClient()).current;

  // Initial fetch of the camera's own heartbeat row
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("robot_status")
        .select("*")
        .eq("robot_id", CAM_ROBOT_ID)
        .maybeSingle<RobotStatus>();
      if (!cancelled && data) setCameraStatus(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Realtime: camera's heartbeat row — gives us camera_ip + online
  // without polling, same pattern as /device.
  useEffect(() => {
    const channel = supabase
      .channel("camera_page_status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "robot_status", filter: `robot_id=eq.${CAM_ROBOT_ID}` },
        (payload) => setCameraStatus(payload.new as RobotStatus)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const heartbeatOnline =
    !!cameraStatus?.updated_at && now - new Date(cameraStatus.updated_at).getTime() < HEARTBEAT_STALE_MS;
  const streamUrl = cameraStatus?.camera_ip ? `http://${cameraStatus.camera_ip}/stream` : null;
  const isLive = heartbeatOnline && !!streamUrl;

  return (
    <DashboardShell title="Live Camera" subtitle="agribot-01">
      <>
        {/* Camera viewport */}
        <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-gray-900">
          {isLive ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={streamUrl!}
              alt="AgriBot live camera feed"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70">
                <WifiOff className="h-5 w-5" />
              </span>
              <p className="text-xs font-medium text-white/70">No camera feed connected</p>
            </div>
          )}
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-white/80">
            <span
              className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-green-400" : "bg-gray-400"}`}
            />
            {isLive ? "LIVE" : "OFFLINE"}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <DisabledAction icon={Camera} label="Capture Image" />
          <DisabledAction icon={Camera} label="Record" />
          <DisabledAction icon={Sparkles} label="AI Analyze" />
        </div>

        {!isLive && (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface p-4 text-center dark:border-gray-700 dark:bg-gray-900">
            <p className="text-sm font-medium text-foreground dark:text-gray-100">
              {cameraStatus?.camera_ip ? "Camera heartbeat stale" : "Camera hardware not streaming yet"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted dark:text-gray-400">
              {cameraStatus?.camera_ip
                ? "The ESP32-CAM hasn't checked in recently. Capture, Record and live AI Analyze depend on an active connection."
                : "This view goes live automatically once the ESP32-CAM connects to WiFi and starts its stream. Capture, Record and live AI Analyze depend on that feed."}
            </p>
          </div>
        )}

        {/* Local-WiFi caveat — this stream loads directly from the camera's
            own IP, not through Supabase, so it only plays for viewers on
            the same network as AGRIBOT. Shown always, not just when live,
            so it's not a surprise the first time someone views this away
            from the farm's WiFi. */}
        <p className="mt-2 text-center text-[11px] text-muted dark:text-gray-500">
          Live video only plays on the same WiFi network as AGRIBOT.
        </p>

        <div className="mt-4 rounded-2xl bg-gradient-to-br from-primary to-secondary p-4 text-white shadow-md shadow-primary/20">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <Sparkles className="h-3.5 w-3.5" />
            Works today
          </p>
          <p className="mt-1 text-sm font-medium leading-snug">
            Upload or take a photo of a plant for a real AI health check — no live camera required.
          </p>
          <Link
            href="/assistant?tab=recommendations"
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/25"
          >
            Go to AI Plant Analysis
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </>
    </DashboardShell>
  );
}

function DisabledAction({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <button
      disabled
      className="flex flex-col items-center gap-1 rounded-xl border border-border bg-white py-3 text-[10px] font-medium text-muted opacity-60 dark:border-gray-800 dark:bg-gray-900"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
        }
