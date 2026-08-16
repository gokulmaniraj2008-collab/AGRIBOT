"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, StatusBadge, IconTile } from "@/components/ui-kit";
import type { RobotStatus, SensorReading, RobotCommandRow, Mission } from "@/lib/types";
import { Power, RefreshCw, ArrowLeft, Database, ListChecks, Trash2 } from "lucide-react";

export default function AdminRobotPage() {
  const supabase = createClient();
  const router = useRouter();
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [latest, setLatest] = useState<SensorReading | null>(null);
  const [commands, setCommands] = useState<RobotCommandRow[]>([]);
  const [totalCommandCount, setTotalCommandCount] = useState<number | null>(null);
  const [totalReadingCount, setTotalReadingCount] = useState<number | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
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
      supabase
        .from("robot_commands")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("sensor_data")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("missions")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10)
        .returns<Mission[]>(),
    ]).then(([{ data: statusRow }, { data: sensorRow }, { data: commandRows }, { count }, { count: readingTotal }, { data: missionRows }]) => {
      if (cancelled) return;
      if (statusRow) setStatus(statusRow);
      if (sensorRow) setLatest(sensorRow);
      if (commandRows) setCommands(commandRows);
      if (count != null) setTotalCommandCount(count);
      if (readingTotal != null) setTotalReadingCount(readingTotal);
      if (missionRows) setMissions(missionRows);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function refresh() {
    setBusy("refresh");
    const [{ data }, { data: sensorRow }, { data: commandRows }, { count }, { count: readingTotal }, { data: missionRows }] = await Promise.all([
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
      supabase
        .from("robot_commands")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("sensor_data")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("missions")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10)
        .returns<Mission[]>(),
    ]);
    if (data) setStatus(data);
    if (sensorRow) setLatest(sensorRow);
    if (commandRows) setCommands(commandRows);
    if (count != null) setTotalCommandCount(count);
    if (readingTotal != null) setTotalReadingCount(readingTotal);
    if (missionRows) setMissions(missionRows);
    setBusy(null);
  }

  async function deleteMission(id: number) {
    setBusy(`mission-${id}`);
    setError(null);
    setNote(null);

    // Clear the pointer first if this mission is the robot's "current"
    // one, otherwise the missions delete would be blocked (or leave a
    // dangling reference) by the robot_status FK.
    if (status?.current_mission_id === id) {
      const { error: statusErr } = await supabase
        .from("robot_status")
        .update({ current_mission_id: null })
        .eq("robot_id", "agribot-01");
      if (statusErr) {
        setError(statusErr.message);
        setBusy(null);
        return;
      }
      setStatus((prev) => (prev ? { ...prev, current_mission_id: null } : prev));
    }

    const { error: plantsErr } = await supabase.from("mission_plants").delete().eq("mission_id", id);
    if (plantsErr) {
      setError(plantsErr.message);
      setBusy(null);
      return;
    }

    const { error: missionErr } = await supabase.from("missions").delete().eq("id", id);
    if (missionErr) {
      setError(missionErr.message);
      setBusy(null);
      return;
    }

    setMissions((prev) => prev.filter((m) => m.id !== id));
    setNote(`Mission #${id} deleted.`);
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
    const { count } = await supabase
      .from("robot_commands")
      .select("id", { count: "exact", head: true });
    if (count != null) setTotalCommandCount(count);

    if (failed.length === 0) {
      setNote("Stop command sent to agribot-01. It will take effect within a few seconds once the robot polls for commands.");
    }
    setBusy(null);
  }

  async function clearAllCommands() {
    setBusy("clear");
    setError(null);
    setNote(null);
    const { data, error: err } = await supabase
      .from("robot_commands")
      .delete()
      .not("id", "is", null) // delete-all guard: Supabase requires a filter on delete
      .select();
    if (err) {
      setError(err.message);
    } else {
      const deletedCount = data?.length ?? 0;
      setCommands([]);
      setTotalCommandCount(0);
      if (deletedCount === 0) {
        setNote("No commands to clear — the list is already empty.");
      } else {
        setNote(`Cleared ${deletedCount} command${deletedCount === 1 ? "" : "s"} (executed + pending).`);
      }
    }
    setBusy(null);
  }

  async function clearAllReadings() {
    setBusy("readings");
    setError(null);
    setNote(null);
    const { data, error: err } = await supabase
      .from("sensor_data")
      .delete()
      .not("id", "is", null) // delete-all guard: Supabase requires a filter on delete
      .select();
    if (err) {
      setError(err.message);
    } else {
      const deletedCount = data?.length ?? 0;
      setLatest(null);
      setTotalReadingCount(0);
      if (deletedCount === 0) {
        setNote("No sensor readings to clear — the table is already empty.");
      } else {
        setNote(`Cleared ${deletedCount} sensor reading${deletedCount === 1 ? "" : "s"}.`);
      }
    }
    setBusy(null);
  }

const isOnline = status?.online ?? false;
  const isStale =
    status?.updated_at && Date.now() - new Date(status.updated_at).getTime() > 30_000;
  const active = isOnline && !isStale;

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
              onClick={clearAllCommands}
              disabled={busy === "clear" || !totalCommandCount}
              className="rounded-xl border border-border bg-white px-3.5 py-2.5 text-xs font-semibold text-foreground transition hover:bg-background disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
            >
              {busy === "clear"
                ? "Clearing…"
                : !totalCommandCount
                ? "No commands to clear"
                : `Clear all commands (${totalCommandCount})`}
            </button>
          </div>
        </Card>

        <Card className="mt-4 p-4">
          <div className="mb-3 flex items-center justify-between gap-2.5">
            <span className="flex items-center gap-2.5">
              <IconTile icon={Database} size={32} />
              <span className="text-sm font-semibold text-foreground dark:text-gray-100">
                Latest Sensor Reading
              </span>
            </span>
            <button
              onClick={clearAllReadings}
              disabled={busy === "readings" || !totalReadingCount}
              className="shrink-0 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition hover:bg-background disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
            >
              {busy === "readings"
                ? "Clearing…"
                : !totalReadingCount
                ? "No readings"
                : `Clear all (${totalReadingCount})`}
            </button>
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
              Missions
            </span>
          </div>
          {missions.length === 0 ? (
            <p className="text-xs text-muted dark:text-gray-400">No missions yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border dark:divide-gray-800">
              {missions.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 py-3 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground dark:text-gray-100">
                      Mission #{m.id}
                    </span>
                    <span className="text-muted dark:text-gray-400"> · {m.total_plants} plants</span>
                    {m.stop_reason && (
                      <span className="text-muted dark:text-gray-400"> · {m.stop_reason.replace(/_/g, " ")}</span>
                    )}
                    <div className="mt-0.5 text-muted dark:text-gray-400">
                      {new Date(m.started_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge
                      label={
                        m.status === "in_progress"
                          ? "Patrolling"
                          : m.status === "completed"
                          ? "Completed"
                          : m.status === "stopped"
                          ? "Stopped"
                          : "Failed"
                      }
                      tone={
                        m.status === "in_progress"
                          ? "info"
                          : m.status === "completed"
                          ? "success"
                          : m.status === "stopped"
                          ? "warning"
                          : "danger"
                      }
                    />
                    <button
                      onClick={() => deleteMission(m.id)}
                      disabled={busy === `mission-${m.id}`}
                      aria-label={`Delete mission ${m.id}`}
                      className="rounded-lg border border-danger/30 bg-danger/5 p-1.5 text-danger transition hover:bg-danger/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
