"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { createClient } from "@/lib/supabase/client";
import { Camera, Sparkles, ArrowRight, WifiOff } from "lucide-react";

const BUCKET = "robot-images";
const DEVICE_PREFIX = "agribot-01";
// If no new photo arrives within this window, we show OFFLINE again.
const STALE_AFTER_MS = 15000;
const POLL_INTERVAL_MS = 3000;

export default function CameraPage() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);
  const supabase = useRef(createClient()).current;

  useEffect(() => {
    let cancelled = false;

    async function fetchLatest() {
      const { data, error } = await supabase.storage.from(BUCKET).list("", {
        limit: 1,
        sortBy: { column: "created_at", order: "desc" },
        search: DEVICE_PREFIX,
      });

      if (cancelled || error || !data || data.length === 0) return;

      const latest = data[0];
      const { data: publicUrlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(latest.name);

      // cache-bust so the <img> actually reloads when the filename repeats
      setImageUrl(`${publicUrlData.publicUrl}?t=${Date.now()}`);
      setLastSeenAt(Date.now());
    }

    fetchLatest();
    const interval = setInterval(fetchLatest, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [supabase]);

  useEffect(() => {
    if (!lastSeenAt) {
      setIsLive(false);
      return;
    }
    setIsLive(true);
    const timeout = setTimeout(() => setIsLive(false), STALE_AFTER_MS);
    return () => clearTimeout(timeout);
  }, [lastSeenAt]);

  return (
    <DashboardShell title="Live Camera" subtitle="agribot-01">
      <>
        {/* Camera viewport */}
        <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-gray-900">
          {isLive && imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
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
              Camera hardware not streaming yet
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted dark:text-gray-400">
              This view goes live automatically once the ESP32-CAM starts uploading photos to
              Supabase Storage. Capture, Record and live AI Analyze depend on that feed.
            </p>
          </div>
        )}

        <div className="mt-4 rounded-2xl bg-gradient-to-br from-primary to-secondary p-4 text-white shadow-md shadow-primary/20">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <Sparkles className="h-3.5 w-3.5" />
            Works today
          </p>
          <p className="mt-1 text-sm font-medium leading-snug">
            Upload or take a photo of a plant for a real AI health check — no live camera required.
          </p>
          <Link
            href="/recommendations"
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
