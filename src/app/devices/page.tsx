"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, StatusBadge, IconTile, SectionHeading } from "@/components/ui-kit";
import type { RobotStatus } from "@/lib/types";
import { Bot, ArrowLeft, RefreshCw, Wifi, WifiOff, Clock } from "lucide-react";

const HEARTBEAT_STALE_MS = 30_000; // same threshold used on /robot and /admin/robot
const TICK_MS = 1000;

function timeAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  const s = Math.floor(diffMs / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DevicesPage() {
  const supabase = createClient();
  const router = useRouter();

  const [devices, setDevices] = useState<RobotStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    const { data } = await supabase
      .from("robot_status")
      .select("*")
      .order("robot_id", { ascending: true })
      .returns<RobotStatus[]>();
    setDevices(data ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime — pick up new devices and status changes as they happen
  useEffect(() => {
    const channel = supabase
      .channel("devices_page_status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "robot_status" },
        (payload) => {
          const row = payload.new as RobotStatus;
          setDevices((prev) => {
            const idx = prev.findIndex((d) => d.robot_id === row.robot_id);
            if (idx === -1) return [...prev, row].sort((a, b) => a.robot_id.localeCompare(b.robot_id));
            const next = [...prev];
            next[idx] = row;
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Tick every second so "Xs ago" / online-vs-stale stays live
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  async function refresh() {
    setBusy(true);
    await load();
    setBusy(false);
  }

  return (
    <DashboardShell title="Devices" subtitle="Connection status">
      <>
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-1 text-xs font-medium text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>

        <div className="mb-3 flex items-center justify-between">
          <SectionHeading eyebrow="ESP32" title="Connected devices" />
          <button
            onClick={refresh}
            disabled={busy}
            className="text-muted transition hover:text-foreground"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-muted dark:text-gray-400">Loading…</p>
        ) : devices.length === 0 ? (
          <Card className="p-4">
            <p className="text-xs text-muted dark:text-gray-400">
              No devices have reported in yet.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {devices.map((d) => {
              const isStale =
                Date.now() - new Date(d.updated_at).getTime() > HEARTBEAT_STALE_MS;
              const connected = d.online && !isStale;
              return (
                <Card key={d.robot_id} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2.5">
                      <IconTile icon={Bot} size={36} />
                      <span>
                        <span className="block text-sm font-semibold text-foreground dark:text-gray-100">
                          {d.name || d.robot_id}
                        </span>
                        <span className="block text-[11px] text-muted dark:text-gray-400">
                          {d.robot_id}
                        </span>
                      </span>
                    </span>
                    <StatusBadge
                      label={connected ? "Connected" : "Disconnected"}
                      tone={connected ? "success" : "muted"}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-background p-3 dark:bg-gray-800/50">
                      <p className="flex items-center gap-1 text-[11px] font-medium text-muted dark:text-gray-400">
                        {connected ? (
                          <Wifi className="h-3 w-3" />
                        ) : (
                          <WifiOff className="h-3 w-3" />
                        )}
                        Mode
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-foreground dark:text-gray-100">
                        {d.mode}
                      </p>
                    </div>
                    <div className="rounded-xl bg-background p-3 dark:bg-gray-800/50">
                      <p className="flex items-center gap-1 text-[11px] font-medium text-muted dark:text-gray-400">
                        <Clock className="h-3 w-3" />
                        Last seen
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-foreground dark:text-gray-100">
                        {timeAgo(d.updated_at, now)}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </>
    </DashboardShell>
  );
          }
                                                                                          
