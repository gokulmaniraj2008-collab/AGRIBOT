"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, StatusBadge, IconTile } from "@/components/ui-kit";
import type { RobotStatus, SensorReading, RobotCommandRow } from "@/lib/types";
import { Power, RefreshCw, ArrowLeft, Database, ListChecks } from "lucide-react";

export default function AdminRobotPage() {
  const supabase = createClient();
  const router = useRouter();
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [latest, setLatest] = useState<SensorReading | null>(null);
  const [commands, setCommands] = useState<RobotCommandRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase
        .from("robot_status")
        .select("*")
        .eq("robot_id", "agribot-01")
        .single<RobotStatus>(),
      supabase
        .from("sensor_data")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SensorReading>(),
      supabase
        .from("robot_commands")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10)
        .returns<RobotCommandRow[]>(),
    ]).then(([{ data: statusRow }, { data: sensorRow }, { data: commandRows }]) => {
      if (cancelled) return;
      if (statusRow) setStatus(statusRow);
      if (sensorRow) setLatest(sensorRow);
      if (commandRows) setCommands(commandRows);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function refresh() {
    setBusy("refresh");
    const [{ data }, { data: sensorRow }, { data: commandRows }] = await Promise.all([
      supabase
        .from("robot_status")
        .select("*")
        .eq("robot_id", "agribot-01")
        .single<RobotStatus>(),
      supabase
        .from("sensor_data")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SensorReading>(),
      supabase
        .from("robot_commands")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10)
        .returns<RobotCommandRow[]>(),
    ]);
    if (data) setStatus(data);
    if (sensorRow) setLatest(sensorRow);
    if (commandRows) setCommands(commandRows);
    setBusy(null);
  }

  async function resetRobot() {
    setBusy("reset");
    setError(null);
    setNote(null);

    // 1. Tell the actual robot to stop — the ESP32 only reacts to rows in
    //    robot_commands (it never reads robot_status), so without this the
    //    button just edits a display value and the robot keeps doing whatever
    //    it was doing.
    const results = await Promise.all([
      fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "stop" }),
      }),
      fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "pump_off" }),
      }),
      fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "set_mode_manual" }),
      }),
    ]);
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      setError(
        `Failed to send ${failed.length} of 3 stop command(s) — check that robot_commands insert policy covers this account.`
      );
    }

    // 2. Also force the dashboard's own status row, so the UI reflects
    //    "offline/stopped" immediately even if the robot is unreachable.
    const { data, error: err } = await supabase
      .from("robot_status")
      .update({
        online: false,
        mode: "manual",
        pump_status: false,
        motor_state: "stopped",
        speed_value: 0,
      })
      .eq("robot_id", "agribot-01")
      .select()
      .single<RobotStatus>();
    if (err) setError(err.message);
    else if (data) setStatus(data);

    const [{ data: commandRows }] = await Promise.all([
      supabase
        .from("robot_commands")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10)
        .returns<RobotCommandRow[]>(),
    ]);
    if (commandRows) setCommands(commandRows);

    if (failed.length === 0) {
      setNote("Stop command sent to agribot-01. It will take effect within a few seconds once the robot polls for commands.");
    }
    setBusy(null);
  }

  async function clearPendingCommands() {
    setBusy("pending");
    setError(null);
    setNote(null);
    const { data, error: err } = await supabase
      .from("robot_commands")
      .delete()
      .eq("executed", false)
      .select();
    if (err) {
      setError(err.message);
    } else {
      const deletedCount = data?.length ?? 0;
      setCommands((prev) => prev.filter((c) => c.executed));
      if (deletedCount === 0) {
        setNote("No pending commands to clear — everything already executed.");
      } else {
        setNote(`Cleared ${deletedCount} pending command${deletedCount === 1 ? "" : "s"}.`);
      }
    }
    setBusy(null);
  }

  const isOnline = status?.online ?? false;
  const isStale =
    status?.updated_at && Date.now() - new Date(status.updated_at).getTime() > 30_000;
  const active = isOnline && !isStale;
  const pendingCount = commands.filter((c) => !c.executed).length;

  return (
    <DashboardShell title="Robot Control" subtitle="Admin" isAdmin>
      <>
        <button
          onClick={() => router.push("/admin")}
          className="mb-4 flex items-center gap-1 text-xs font-medium text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Admin
        </button>

        {error && (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-xs font-medium text-danger">
            {error}
          </div>
        )}

        {note && !error && (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs font-medium text-primary">
            {note}
          </div>
        )}

        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <IconTile icon={Power} size={32} />
              <span className="text-sm font-semibold text-foreground dark:text-gray-100">
                agribot-01
              </span>
            </span>
            <div className="flex items-center gap-2">
              <StatusBadge
                label={active ? "ONLINE" : "OFFLINE"}
                tone={active ? "success" : "muted"}
              />
              <button
                onClick={refresh}
                disabled={busy === "refresh"}
                className="text-muted transition hover:text-foreground"
                aria-label="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-background p-3 dark:bg-gray-800/50">
              <p className="text-[11px] font-medium text-muted dark:text-gray-400">Mode</p>
              <p className="mt-0.5 text-sm font-bold text-foreground dark:text-gray-100">
                {status?.mode ?? "—"}
              </p>
            </div>
            <div className="rounded-xl bg-background p-3 dark:bg-gray-800/50">
              <p className="text-[11px] font-medium text-muted dark:text-gray-400">Motor</p>
              <p className="mt-0.5 text-sm font-bold text-foreground dark:text-gray-100">
                {status?.motor_state ?? "—"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={resetRobot}
              disabled={busy === "reset"}
              className="rounded-xl border border-border bg-white px-3.5 py-2.5 text-xs font-semibold text-foreground transition hover:bg-background disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
            >
              {busy === "reset" ? "Resetting…" : "Force stop & reset"}
            </button>
            <button
              onClick={clearPendingCommands}
              disabled={busy === "pending" || pendingCount === 0}
              className="rounded-xl border border-border bg-white px-3.5 py-2.5 text-xs font-semibold text-foreground transition hover:bg-background disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
            >
              {busy === "pending"
                ? "Clearing…"
                : pendingCount === 0
                ? "No pending commands"
                : `Clear ${pendingCount} pending command${pendingCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </Card>

        <Card className="mt-4 p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <IconTile icon={Database} size={32} />
            <span className="text-sm font-semibold text-foreground dark:text-gray-100">
              Latest Sensor Reading
            </span>
          </div>
          {!latest ? (
            <p className="text-xs text-muted dark:text-gray-400">No readings yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-background p-3 dark:bg-gray-800/50">
                  <p className="text-[11px] font-medium text-muted dark:text-gray-400">Soil Moisture</p>
                  <p className="mt-0.5 text-sm font-bold text-foreground dark:text-gray-100">
                    {latest.soil_moisture != null ? `${latest.soil_moisture.toFixed(0)}%` : "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-background p-3 dark:bg-gray-800/50">
                  <p className="text-[11px] font-medium text-muted dark:text-gray-400">Temperature</p>
                  <p className="mt-0.5 text-sm font-bold text-foreground dark:text-gray-100">
                    {latest.temperature != null ? `${latest.temperature.toFixed(1)}°C` : "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-background p-3 dark:bg-gray-800/50">
                  <p className="text-[11px] font-medium text-muted dark:text-gray-400">Humidity</p>
                  <p className="mt-0.5 text-sm font-bold text-foreground dark:text-gray-100">
                    {latest.humidity != null ? `${latest.humidity.toFixed(0)}%` : "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-background p-3 dark:bg-gray-800/50">
                  <p className="text-[11px] font-medium text-muted dark:text-gray-400">Battery</p>
                  <p className="mt-0.5 text-sm font-bold text-foreground dark:text-gray-100">
                    {latest.battery_percent != null ? `${latest.battery_percent.toFixed(0)}%` : "—"}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted dark:text-gray-400">
                Last reported {new Date(latest.created_at).toLocaleString()}
              </p>
            </>
          )}
        </Card>

        <Card className="mt-4 p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <IconTile icon={ListChecks} size={32} />
            <span className="text-sm font-semibold text-foreground dark:text-gray-100">
              Recent Commands
            </span>
          </div>
          {commands.length === 0 ? (
            <p className="text-xs text-muted dark:text-gray-400">No commands yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border dark:divide-gray-800">
              {commands.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-3 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground dark:text-gray-100">
                      {c.command}
                    </span>
                    {c.value != null && (
                      <span className="text-muted dark:text-gray-400"> · value {c.value}</span>
                    )}
                    <div className="mt-0.5 text-muted dark:text-gray-400">
                      {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                  <StatusBadge
                    label={c.executed ? "Executed" : "Pending"}
                    tone={c.executed ? "success" : "warning"}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      </>
    </DashboardShell>
  );
      }
      
