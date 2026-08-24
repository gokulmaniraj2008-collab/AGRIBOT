"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RobotStatus, RobotCommand, RobotCommandRow } from "@/lib/types";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, SectionHeading, StatusBadge } from "@/components/ui-kit";
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Square,
  Droplet,
  Gauge,
  Terminal,
  Wifi,
  WifiOff,
} from "lucide-react";

const ROBOT_ID = "agribot-01";
const HEARTBEAT_STALE_MS = 30_000;
const COMMAND_ROWS = 8;
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

type DriveCommand = "forward" | "backward" | "left" | "right" | "stop";

export default function AdminControlPage() {
  const supabase = useRef(createClient()).current;

  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [commands, setCommands] = useState<RobotCommandRow[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const [driveBusy, setDriveBusy] = useState<DriveCommand | null>(null);
  const [pumpBusy, setPumpBusy] = useState<"pump_on" | "pump_off" | null>(null);
  const [speedBusy, setSpeedBusy] = useState(false);
  const [speedValue, setSpeedValue] = useState(130);
  const [error, setError] = useState<string | null>(null);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: statusRow }, { data: cmdRows }] = await Promise.all([
        supabase.from("robot_status").select("*").eq("robot_id", ROBOT_ID).single<RobotStatus>(),
        supabase
          .from("robot_commands")
          .select("*")
          .eq("robot_id", ROBOT_ID)
          .order("created_at", { ascending: false })
          .limit(COMMAND_ROWS)
          .returns<RobotCommandRow[]>(),
      ]);
      if (cancelled) return;
      if (statusRow) {
        setStatus(statusRow);
        setSpeedValue(statusRow.speed_value || 130);
      }
      if (cmdRows) setCommands(cmdRows);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Realtime: robot_status
  useEffect(() => {
    const channel = supabase
      .channel("control_page_status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "robot_status", filter: `robot_id=eq.${ROBOT_ID}` },
        (payload) => setStatus(payload.new as RobotStatus)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Realtime: robot_commands
  useEffect(() => {
    const channel = supabase
      .channel("control_page_commands")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "robot_commands", filter: `robot_id=eq.${ROBOT_ID}` },
        (payload) => {
          const row = payload.new as RobotCommandRow;
          setCommands((prev) => {
            const withoutOld = prev.filter((c) => c.id !== row.id);
            return [row, ...withoutOld]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, COMMAND_ROWS);
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const heartbeatOnline =
    !!status?.online &&
    !!status?.updated_at &&
    now - new Date(status.updated_at).getTime() < HEARTBEAT_STALE_MS;

  async function sendCommand(command: RobotCommand, value?: number) {
    setError(null);
    try {
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, robot_id: ROBOT_ID, ...(value != null ? { value } : {}) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to send ${command} (${res.status})`);
        return false;
      }
      return true;
    } catch {
      setError("Network error — could not reach the server.");
      return false;
    }
  }

  async function drive(command: DriveCommand) {
    setDriveBusy(command);
    await sendCommand(command);
    setDriveBusy(null);
  }

  async function pump(command: "pump_on" | "pump_off") {
    setPumpBusy(command);
    await sendCommand(command);
    setPumpBusy(null);
  }

  async function applySpeed() {
    setSpeedBusy(true);
    await sendCommand("set_speed", speedValue);
    setSpeedBusy(false);
  }

  const driveDisabled = driveBusy !== null;
  const dpadButtonClass =
    "flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface text-foreground transition active:scale-[0.94] disabled:opacity-40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100";

  return (
    <DashboardShell title="Manual Control" subtitle={ROBOT_ID} online={heartbeatOnline} isAdmin>
      <>
        <SectionHeading
          eyebrow="Admin"
          title="Drive AgriBot"
          desc="Sends commands through robot_commands — the ESP32 picks them up on its next poll (~1.5s)."
        />

        {/* Connection status */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm"
                style={{ backgroundColor: heartbeatOnline ? "#16a34a" : "#9ca3af" }}
              >
                {heartbeatOnline ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground dark:text-gray-100">
                  {heartbeatOnline ? "Robot online" : "Robot offline"}
                </p>
                <p className="text-xs text-muted dark:text-gray-400">
                  Motor: {status?.motor_state ?? "—"} · Pump: {status?.pump_status ? "ON" : "OFF"}
                </p>
              </div>
            </div>
            <StatusBadge label={heartbeatOnline ? "Online" : "Offline"} tone={heartbeatOnline ? "success" : "muted"} />
          </div>
          {!heartbeatOnline && (
            <p className="mt-3 text-xs text-warning">
              Commands still queue in robot_commands even while offline — they&apos;ll run once the ESP32 reconnects.
            </p>
          )}
        </Card>

        {/* D-pad */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-400">
            Direction
          </p>
          <Card className="flex flex-col items-center gap-3 p-5">
            <button
              type="button"
              onClick={() => drive("forward")}
              disabled={driveDisabled}
              aria-label="Forward"
              className={dpadButtonClass}
            >
              <ArrowUp className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => drive("left")}
                disabled={driveDisabled}
                aria-label="Left"
                className={dpadButtonClass}
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => drive("stop")}
                disabled={driveDisabled}
                aria-label="Stop"
                className="flex h-16 w-16 items-center justify-center rounded-2xl border border-danger/30 bg-danger/5 text-danger transition active:scale-[0.94] disabled:opacity-40"
              >
                <Square className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => drive("right")}
                disabled={driveDisabled}
                aria-label="Right"
                className={dpadButtonClass}
              >
                <ArrowRight className="h-6 w-6" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => drive("backward")}
              disabled={driveDisabled}
              aria-label="Backward"
              className={dpadButtonClass}
            >
              <ArrowDown className="h-6 w-6" />
            </button>
            {driveBusy && (
              <p className="text-[11px] text-muted dark:text-gray-400">Sending {driveBusy}…</p>
            )}
          </Card>
        </div>

        {/* Pump */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-400">
            Pump / 12V Motor
          </p>
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2.5">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: status?.pump_status ? "#16a34a1a" : "#9ca3af1a", color: status?.pump_status ? "#16a34a" : "#9ca3af" }}
              >
                <Droplet className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground dark:text-gray-100">
                  {status?.pump_status ? "Currently ON" : "Currently OFF"}
                </p>
                <p className="text-[11px] text-muted dark:text-gray-400">Relay-controlled 12V output</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => pump("pump_on")}
                disabled={pumpBusy !== null}
                className="rounded-2xl bg-primary py-3 text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-50"
              >
                {pumpBusy === "pump_on" ? "Sending…" : "Turn ON"}
              </button>
              <button
                type="button"
                onClick={() => pump("pump_off")}
                disabled={pumpBusy !== null}
                className="rounded-2xl border border-border bg-surface py-3 text-sm font-semibold text-foreground transition active:scale-[0.97] disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
              >
                {pumpBusy === "pump_off" ? "Sending…" : "Turn OFF"}
              </button>
            </div>
          </Card>
        </div>

        {/* Speed */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-400">
            Speed
          </p>
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Gauge className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground dark:text-gray-100">{speedValue} / 255</p>
                <p className="text-[11px] text-muted dark:text-gray-400">
                  Current firmware acknowledges this but always drives at its fixed forward/reverse speed —
                  see AGRIBOT.ino for the PWM values in use.
                </p>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={255}
              value={speedValue}
              onChange={(e) => setSpeedValue(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <button
              type="button"
              onClick={applySpeed}
              disabled={speedBusy}
              className="mt-3 w-full rounded-2xl border border-border bg-surface py-3 text-sm font-semibold text-foreground transition active:scale-[0.98] disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
            >
              {speedBusy ? "Sending…" : "Set Speed"}
            </button>
          </Card>
        </div>

        {error && (
          <p className="mt-4 text-center text-xs font-medium text-danger">{error}</p>
        )}

        {/* Recent commands */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-400">
            Recent Commands
          </p>
          <Card className="p-3">
            {commands.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted dark:text-gray-400">No commands yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border dark:divide-gray-800">
                {commands.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Terminal className="h-3.5 w-3.5 shrink-0 text-muted dark:text-gray-500" />
                      <span className="truncate text-sm font-medium text-foreground dark:text-gray-100">
                        {c.command}
                        {c.value != null ? ` (${c.value})` : ""}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] text-muted dark:text-gray-500">{timeAgo(c.created_at, now)}</span>
                      <StatusBadge
                        label={c.executed ? "Executed" : "Pending"}
                        tone={c.executed ? "success" : "warning"}
                        dot={false}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </>
    </DashboardShell>
  );
        }
        
