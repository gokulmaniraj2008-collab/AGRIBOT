"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { RobotStatus, SensorReading, Mission, MissionPlant } from "@/lib/types";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatusBadge } from "@/components/ui-kit";
import {
  Bot,
  Battery,
  MapPin,
  Gauge,
  Power,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Square,
  Droplet,
  Radar,
  Zap,
  Compass,
  Home,
  ListChecks,
  ShieldAlert,
  XCircle,
} from "lucide-react";

const SECTION_TINTS: Record<string, string> = {
  status: "#16a34a",
  mode: "#6366f1",
  control: "#0ea5e9",
  pump: "#0891b2",
  irrigation: "#0ea5e9",
  mission: "#d97706",
};

function tint(color: string) {
  return { backgroundImage: `linear-gradient(135deg, ${color}14 0%, ${color}05 100%)` };
}

export default function RobotClient({
  initialStatus,
  initialLatest,
}: {
  initialStatus: RobotStatus | null;
  initialLatest: SensorReading | null;
}) {
  const supabase = createClient();
  const [status, setStatus] = useState<RobotStatus | null>(initialStatus);
  const [latest, setLatest] = useState<SensorReading | null>(initialLatest);
  const [sending, setSending] = useState<string | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [missionPlants, setMissionPlants] = useState<MissionPlant[]>([]);
  // Optimistic mode: flips the button instantly on tap so it doesn't feel
  // laggy. Cleared as soon as the real status row confirms the switch, or
  // after a timeout if the robot never confirms (e.g. it's offline).
  const [optimisticMode, setOptimisticMode] = useState<"manual" | "auto" | null>(null);
  // Same idea for the water pump toggle.
  const [optimisticPump, setOptimisticPump] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: statusRow }, { data: latestRow }] = await Promise.all([
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
      ]);
      if (cancelled) return;
      if (statusRow) setStatus(statusRow);
      if (latestRow) setLatest(latestRow);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("robot_status_changes_page")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "robot_status",
          filter: "robot_id=eq.agribot-01",
        },
        (payload) => setStatus(payload.new as RobotStatus)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("sensor_data_latest_page")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensor_data" },
        (payload) => setLatest(payload.new as SensorReading)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Most recent mission (in progress or just finished) and its per-plant
  // rows — this is the mission board, kept separate from the manual drive
  // controls below so it works whether the mission was started from the
  // Patrol Row button, AUTO mode, or another client entirely.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: missionRow } = await supabase
        .from("missions")
        .select("*")
        .eq("robot_id", "agribot-01")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle<Mission>();
      if (cancelled) return;
      if (missionRow) {
        setMission(missionRow);
        const { data: plantRows } = await supabase
          .from("mission_plants")
          .select("*")
          .eq("mission_id", missionRow.id);
        if (!cancelled && plantRows) setMissionPlants(plantRows as MissionPlant[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("missions_changes_page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "missions", filter: "robot_id=eq.agribot-01" },
        (payload) => {
          const row = payload.new as Mission;
          // Only the most recent mission is tracked here — a new row
          // replaces the board and clears the old mission's plant rows
          // (the next mission_plants subscription push repopulates it).
          setMission((prev) => (!prev || row.id === prev.id || row.started_at >= prev.started_at ? row : prev));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    if (!mission) return;
    setMissionPlants([]);
    const channel = supabase
      .channel(`mission_plants_changes_${mission.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mission_plants", filter: `mission_id=eq.${mission.id}` },
        (payload) => {
          const row = payload.new as MissionPlant;
          setMissionPlants((prev) => {
            const others = prev.filter((p) => p.id !== row.id);
            return [...others, row];
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, mission]);

  const missionStats = mission
    ? {
        total: mission.total_plants,
        watered: missionPlants.filter((p) => p.status === "watered").length,
        skipped: missionPlants.filter((p) => p.status === "skipped" || p.status === "failed").length,
        remaining: mission.total_plants - missionPlants.length,
        completed: missionPlants.length,
      }
    : null;

  // "Current plant" is the most recently updated row — the plant the
  // robot last finished with, or is presently at.
  const currentMissionPlant = missionPlants.length
    ? [...missionPlants].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0]
    : null;

  const sendCommand = useCallback(async (command: string, value?: number) => {
    setSending(command);
    try {
      await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, value }),
      });
    } finally {
      setSending(null);
    }
  }, []);

  const cancelMission = useCallback(() => {
    if (!mission) return;
    sendCommand("cancel_mission", mission.id);
  }, [mission, sendCommand]);

  const safetyReset = useCallback(() => {
    sendCommand("safety_reset");
  }, [sendCommand]);

  // AUTO mode now runs a continuous loop of full patrol laps on the
  // firmware side (see agribot_main.ino: runAutoPatrolCycle()), so
  // turning it on needs to tell the robot how many plants make up one
  // lap — same value the manual "Start Patrol" button uses. Declared
  // above setMode (rather than in its original spot further down) so
  // it's in scope here.
  const [patrolCount, setPatrolCount] = useState(5);

  const setMode = useCallback(
    (mode: "manual" | "auto") => {
      setOptimisticMode(mode);
      sendCommand(mode === "auto" ? "set_mode_auto" : "set_mode_manual", mode === "auto" ? patrolCount : undefined);
    },
    [sendCommand, patrolCount]
  );

  // Clear the optimistic override once the real status catches up, or after
  // 8s if it never does (robot offline / command never executed).
  useEffect(() => {
    if (!optimisticMode) return;
    if (status?.mode === optimisticMode) {
      setOptimisticMode(null);
      return;
    }
    const timeout = setTimeout(() => setOptimisticMode(null), 8000);
    return () => clearTimeout(timeout);
  }, [optimisticMode, status?.mode]);

  const displayedMode = optimisticMode ?? status?.mode ?? "manual";

  const setPump = useCallback(
    (on: boolean) => {
      setOptimisticPump(on);
      sendCommand(on ? "pump_on" : "pump_off");
    },
    [sendCommand]
  );

  useEffect(() => {
    if (optimisticPump === null) return;
    if ((status?.pump_status ?? false) === optimisticPump) {
      setOptimisticPump(null);
      return;
    }
    const timeout = setTimeout(() => setOptimisticPump(null), 8000);
    return () => clearTimeout(timeout);
  }, [optimisticPump, status?.pump_status]);

  const displayedPump = optimisticPump ?? status?.pump_status ?? false;

  // Speed control: local value updates instantly while dragging; the actual
  // set_speed command is debounced so we don't flood the queue with a
  // request on every pixel of slider movement.
  const [speedDraft, setSpeedDraft] = useState<number | null>(null);
  const [saveIndex, setSaveIndex] = useState(1);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  const saveLocation = useCallback(async () => {
    setSending("save_plant_location");
    setSavedFeedback(null);
    try {
      await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "save_plant_location", value: saveIndex }),
      });
      setSavedFeedback(`Saved plant ${saveIndex} — check Plant Locations map once the robot confirms.`);
    } finally {
      setSending(null);
    }
  }, [saveIndex]);
  const displayedSpeed = speedDraft ?? status?.speed_value ?? 200;

  useEffect(() => {
    if (speedDraft === null) return;
    const timeout = setTimeout(() => {
      sendCommand("set_speed", speedDraft);
    }, 300);
    return () => clearTimeout(timeout);
  }, [speedDraft, sendCommand]);

  // Clear the draft once the real status catches up, so future firmware
  // pushes aren't masked forever by a stale local value.
  useEffect(() => {
    if (speedDraft === null) return;
    if (status?.speed_value === speedDraft) setSpeedDraft(null);
  }, [speedDraft, status?.speed_value]);

  const isOnline = status?.online ?? false;
  const isStale =
    status?.updated_at &&
    Date.now() - new Date(status.updated_at).getTime() > 30_000;
  const active = isOnline && !isStale;

  return (
    <DashboardShell title="Robot Control" subtitle="AgriBot AI — Unit 01" online={active}>
      <>
        <Link
          href="/logs"
          className="mb-3 flex items-center justify-between rounded-2xl border border-border bg-white px-4 py-3 text-sm font-semibold text-foreground shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
        >
          <span className="flex items-center gap-2">
            <Radar className="h-4 w-4" style={{ color: SECTION_TINTS.status }} />
            View Activity Log
          </span>
          <span className="text-xs font-medium text-muted">Detect → water → save →</span>
        </Link>

        {status?.safety_stopped && (
          <section className="mt-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 shadow-sm">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-danger">Safety stop latched</p>
                <p className="mt-0.5 text-xs text-danger/80">
                  {status.last_fault ?? "A safety fault was reported."} AUTO and new missions are
                  blocked until this is cleared.
                </p>
                <button
                  onClick={safetyReset}
                  disabled={sending === "safety_reset"}
                  className="mt-2.5 rounded-full bg-danger px-4 py-1.5 text-xs font-medium text-white shadow-sm transition disabled:opacity-60"
                >
                  {sending === "safety_reset" ? "Resetting…" : "Safety Reset"}
                </button>
              </div>
            </div>
          </section>
        )}

        {mission && (
          <section className="mt-3 rounded-2xl p-4 shadow-sm" style={tint(SECTION_TINTS.mission)}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground dark:text-gray-100">
                <ListChecks className="h-4 w-4" style={{ color: SECTION_TINTS.mission }} />
                Mission #{mission.id}
              </span>
              <StatusBadge
                label={
                  mission.status === "in_progress"
                    ? "Patrolling"
                    : mission.status === "completed"
                    ? "Completed"
                    : mission.status === "stopped"
                    ? "Stopped"
                    : "Failed"
                }
                tone={
                  mission.status === "in_progress"
                    ? "info"
                    : mission.status === "completed"
                    ? "success"
                    : mission.status === "stopped"
                    ? "warning"
                    : "danger"
                }
              />
            </div>

            {mission.stop_reason && (
              <p className="mt-1 text-xs text-muted dark:text-gray-400">
                Reason: {mission.stop_reason.replace(/_/g, " ")}
              </p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2.5 text-sm sm:grid-cols-4">
              <MissionStat label="Plants" value={missionStats!.total} />
              <MissionStat label="Completed" value={missionStats!.completed} />
              <MissionStat label="Watered" value={missionStats!.watered} />
              <MissionStat label="Skipped" value={missionStats!.skipped} />
            </div>
            <div className="mt-2.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/60 dark:bg-gray-800">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (missionStats!.completed / Math.max(1, missionStats!.total)) * 100)}%`,
                    backgroundColor: SECTION_TINTS.mission,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-muted dark:text-gray-400">
                {missionStats!.remaining} remaining
              </p>
            </div>

            {currentMissionPlant && (
              <div className="mt-3 rounded-xl bg-white/70 px-3 py-2.5 text-xs dark:bg-gray-900/50">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground dark:text-gray-100">
                    Plant #{currentMissionPlant.plant_index}
                  </span>
                  <span className="text-muted dark:text-gray-400">
                    {currentMissionPlant.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-muted dark:text-gray-400">
                  <span>
                    Soil: {currentMissionPlant.soil_moisture != null ? `${currentMissionPlant.soil_moisture}%` : "—"}
                  </span>
                  <span>
                    {currentMissionPlant.watered
                      ? `Watered${currentMissionPlant.water_duration_s != null ? ` · ${currentMissionPlant.water_duration_s}s` : ""}`
                      : "Not watered"}
                  </span>
                </div>
              </div>
            )}

            {mission.status === "in_progress" && (
              <button
                onClick={cancelMission}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-white py-2 text-xs font-medium text-danger shadow-sm transition dark:bg-gray-900"
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancel Mission
              </button>
            )}
          </section>
        )}

        <section className="rounded-2xl p-4 shadow-sm" style={tint(SECTION_TINTS.status)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-white shadow-sm"
                style={{ backgroundColor: SECTION_TINTS.status }}
              >
                <Bot className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground dark:text-gray-100">
                  AgriBot AI — Unit 01
                </p>
                <p className="mt-0.5 text-xs text-muted dark:text-gray-400">
                  {status?.mode === "auto" ? "Auto Scan" : "Manual"}
                </p>
              </div>
            </div>
            <StatusBadge label={active ? "Online" : "Offline"} tone={active ? "success" : "muted"} />
          </div>

          {/* Battery bar — mirrors the reference mockup's inline battery meter */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 font-medium text-foreground dark:text-gray-200">
                <Battery className="h-3.5 w-3.5" /> Battery
              </span>
              <span className="font-semibold text-foreground dark:text-gray-100">
                {latest?.battery_percent != null ? `${latest.battery_percent.toFixed(0)}%` : "—"}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/60 dark:bg-gray-800">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(0, Math.min(100, latest?.battery_percent ?? 0))}%` }}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5 text-sm">
            <InfoRow
              icon={<MapPin className="h-4 w-4" />}
              color="#f97316"
              label="GPS"
              value={latest?.latitude != null && latest?.longitude != null ? "Connected" : "No signal"}
            />
            <InfoRow
              icon={<Power className="h-4 w-4" />}
              color="#0ea5e9"
              label="Mode"
              value={status?.mode === "auto" ? "Auto" : "Manual"}
            />
          </div>
        </section>
      {/* Telemetry — every value below comes from a real column on robot_status / sensor_data */}
        <section className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-400">
            Telemetry
          </p>
          <div className="grid grid-cols-2 gap-2.5 text-sm md:grid-cols-3">
            <InfoRow
              icon={<Gauge className="h-4 w-4" />}
              color="#6366f1"
              label="Speed setpoint"
              value={status ? `${displayedSpeed}` : "—"}
            />
            <InfoRow
              icon={<Radar className="h-4 w-4" />}
              color="#a855f7"
              label="Ultrasonic"
              value={latest?.distance_cm != null ? `${latest.distance_cm.toFixed(0)} cm` : "—"}
            />
            <InfoRow
              icon={<Zap className="h-4 w-4" />}
              color="#16a34a"
              label="Voltage"
              value={latest?.battery_voltage != null ? `${latest.battery_voltage.toFixed(1)} V` : "—"}
            />
            <InfoRow
              icon={<MapPin className="h-4 w-4" />}
              color="#f97316"
              label="Latitude"
              value={latest?.latitude != null ? latest.latitude.toFixed(4) : "—"}
            />
            <InfoRow
              icon={<MapPin className="h-4 w-4" />}
              color="#f97316"
              label="Longitude"
              value={latest?.longitude != null ? latest.longitude.toFixed(4) : "—"}
            />
            <InfoRow
              icon={<Bot className="h-4 w-4" />}
              color="#0ea5e9"
              label="Motor state"
              value={status?.motor_state ?? "stopped"}
            />
          </div>
        </section>

        <section className="mt-4 rounded-2xl p-4 shadow-sm" style={tint(SECTION_TINTS.mode)}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground dark:text-gray-100">Mode</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setMode("manual")}
              disabled={sending === "set_mode_manual"}
              className={`rounded-xl py-2.5 text-xs font-medium shadow-sm transition ${
                displayedMode === "manual"
                  ? "bg-primary text-white"
                  : "bg-white text-muted dark:bg-gray-900 dark:text-gray-400"
              }`}
            >
              Manual
            </button>
            <button
              onClick={() => setMode("auto")}
              disabled={sending === "set_mode_auto"}
              className={`rounded-xl py-2.5 text-xs font-medium shadow-sm transition ${
                displayedMode === "auto"
                  ? "bg-primary text-white"
                  : "bg-white text-muted dark:bg-gray-900 dark:text-gray-400"
              }`}
            >
              Auto
            </button>
            {/* Patrol & Return-home aren't wired to firmware yet (no matching RobotCommand) —
                shown but disabled rather than faked, so the UI never lies about what the robot will do. */}
            <button
              disabled
              title="Not available yet — no patrol command in firmware"
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-white/60 py-2 text-[10px] font-medium text-muted opacity-60 dark:bg-gray-900/60"
            >
              <Compass className="h-3.5 w-3.5" />
              Patrol
            </button>
            <button
              disabled
              title="Not available yet — no return-to-home command in firmware"
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-white/60 py-2 text-[10px] font-medium text-muted opacity-60 dark:bg-gray-900/60"
            >
              <Home className="h-3.5 w-3.5" />
              Home
            </button>
          </div>
        </section>

        <section className="mt-4 rounded-2xl p-4 shadow-sm" style={tint(SECTION_TINTS.control)}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground dark:text-gray-100">Speed</span>
            <span className="text-sm font-semibold text-foreground dark:text-gray-100">
              {displayedSpeed}
              <span className="text-xs font-normal text-muted dark:text-gray-400"> / 255</span>
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={255}
            value={displayedSpeed}
            onChange={(e) => setSpeedDraft(Number(e.target.value))}
            disabled={displayedMode === "auto"}
            className="w-full accent-sky-500 disabled:opacity-40"
            aria-label="Motor speed"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted dark:text-gray-400">
            <span>Slow</span>
            <span>Fast</span>
          </div>
          {displayedMode === "auto" && (
            <p className="mt-2 text-center text-xs text-muted dark:text-gray-400">
              Switch to Manual mode to adjust speed.
            </p>
          )}
        </section>

        <section className="mt-4 rounded-2xl p-4 shadow-sm" style={tint(SECTION_TINTS.control)}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground dark:text-gray-100">
              Manual Control
            </span>
            <span className="text-xs capitalize text-muted dark:text-gray-400">
              {status?.motor_state ?? "stopped"}
            </span>
          </div>

          <div className="mx-auto grid w-44 grid-cols-3 gap-2.5">
            <div />
            <DirButton
              icon={<ArrowUp className="h-5 w-5" />}
              onClick={() => sendCommand("forward")}
              disabled={status?.mode === "auto"}
            />
            <div />
            <DirButton
              icon={<ArrowLeft className="h-5 w-5" />}
              onClick={() => sendCommand("left")}
              disabled={status?.mode === "auto"}
            />
            <DirButton
              icon={<Square className="h-5 w-5" />}
              onClick={() => sendCommand("stop")}
              disabled={status?.mode === "auto"}
              variant="danger"
            />
            <DirButton
              icon={<ArrowRight className="h-5 w-5" />}
              onClick={() => sendCommand("right")}
              disabled={status?.mode === "auto"}
            />
            <div />
            <DirButton
              icon={<ArrowDown className="h-5 w-5" />}
              onClick={() => sendCommand("backward")}
              disabled={status?.mode === "auto"}
            />
            <div />
          </div>

          {status?.mode === "auto" && (
            <p className="mt-3 text-center text-xs text-muted dark:text-gray-400">
              Switch to Manual mode to drive the robot directly.
            </p>
          )}
        </section>

        <section className="mt-4 rounded-2xl p-4 shadow-sm" style={tint(SECTION_TINTS.pump)}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-gray-100">
              <Droplet className="h-4 w-4" style={{ color: SECTION_TINTS.pump }} />
              Water Pump
            </span>
            <button
              onClick={() => setPump(!displayedPump)}
              disabled={sending === "pump_on" || sending === "pump_off"}
              className={`rounded-full px-4 py-1.5 text-xs font-medium shadow-sm transition ${
                displayedPump
                  ? "text-white"
                  : "bg-white text-muted dark:bg-gray-900 dark:text-gray-400"
              }`}
              style={displayedPump ? { backgroundColor: SECTION_TINTS.pump } : undefined}
            >
              {displayedPump ? "Turn Off" : "Turn On"}
            </button>
          </div>
        </section>
        <section className="mt-4 rounded-2xl p-4 shadow-sm" style={tint(SECTION_TINTS.irrigation)}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-gray-100">
              <Compass className="h-4 w-4" style={{ color: SECTION_TINTS.irrigation }} />
              Patrol Row
            </span>
          </div>
          <p className="mt-1 text-xs text-muted dark:text-gray-400">
            Drives forward one plant-step at a time, checking soil moisture at each stop.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={50}
              value={patrolCount}
              onChange={(e) => setPatrolCount(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-foreground dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              aria-label="Number of plants"
            />
            <span className="text-xs text-muted dark:text-gray-400">plants</span>
            <button
              onClick={() => sendCommand("patrol_row", patrolCount)}
              disabled={sending === "patrol_row"}
              className="ml-auto rounded-full px-4 py-1.5 text-xs font-medium text-white shadow-sm transition disabled:opacity-60"
              style={{ backgroundColor: SECTION_TINTS.irrigation }}
            >
              {sending === "patrol_row" ? "Starting…" : "Start Patrol"}
            </button>
          </div>
        </section>

        <section className="mt-4 rounded-2xl p-4 shadow-sm" style={tint(SECTION_TINTS.irrigation)}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-gray-100">
              <MapPin className="h-4 w-4" style={{ color: SECTION_TINTS.irrigation }} />
              Plant Locations
            </span>
            <Link href="/plants" className="text-xs font-semibold" style={{ color: SECTION_TINTS.irrigation }}>
              View map
            </Link>
          </div>
          <p className="mt-1 text-xs text-muted dark:text-gray-400">
            Stand the robot at a plant, then save its GPS fix as that plant&apos;s number. Re-saving the
            same number overwrites its old spot.
          </p>

          <div className="mt-3 flex items-center gap-1.5 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                status?.gps_fix ? "bg-green-500" : "bg-gray-400"
              }`}
            />
            {status?.gps_fix ? (
              <span className="text-green-700 dark:text-green-400">
                GPS locked{status.gps_satellites ? ` · ${status.gps_satellites} satellites` : ""}
              </span>
            ) : (
              <span className="text-muted dark:text-gray-400">
                No GPS fix yet — go outside and wait, then Save Location will work
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={200}
              value={saveIndex}
              onChange={(e) => setSaveIndex(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-foreground dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              aria-label="Plant number"
            />
            <span className="text-xs text-muted dark:text-gray-400">plant #</span>
            <button
              onClick={saveLocation}
              disabled={sending === "save_plant_location" || !status?.gps_fix}
              className="ml-auto rounded-full px-4 py-1.5 text-xs font-medium text-white shadow-sm transition disabled:opacity-40"
              style={{ backgroundColor: SECTION_TINTS.irrigation }}
            >
              {sending === "save_plant_location" ? "Saving…" : "Save Location"}
            </button>
          </div>
          {savedFeedback && (
            <p className="mt-2 text-xs text-primary">{savedFeedback}</p>
          )}
        </section>
      </>
    </DashboardShell>
  );
}

function ToggleButton({
  icon,
  label,
  on,
  onClick,
  disabled,
  full,
  color = "#16a34a",
}: {
  icon?: React.ReactNode;
  label: string;
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  full?: boolean;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${full ? "w-full" : ""} flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium shadow-sm transition disabled:opacity-50 ${
        on ? "text-white" : "bg-white text-muted dark:bg-gray-900 dark:text-gray-400"
      }`}
      style={on ? { backgroundColor: color } : undefined}
    >
      {icon}
      {label} {on ? "· On" : "· Off"}
    </button>
  );
}

function MissionStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2 text-center dark:bg-gray-900/50">
      <p className="text-base font-semibold text-foreground dark:text-gray-100">{value}</p>
      <p className="text-[11px] text-muted dark:text-gray-400">{label}</p>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  color = "#16a34a",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2.5 dark:bg-gray-900/50">
      <span className="flex items-center gap-1.5 text-xs text-muted dark:text-gray-400">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-md"
          style={{ backgroundColor: `${color}22`, color }}
        >
          {icon}
        </span>
        {label}
      </span>
      <span className="text-xs font-medium text-foreground dark:text-gray-100">{value}</span>
    </div>
  );
}

function DirButton({
  icon,
  onClick,
  disabled,
  variant,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "danger";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex aspect-square items-center justify-center rounded-xl shadow-sm transition disabled:opacity-40 ${
        variant === "danger"
          ? "bg-danger/15 text-danger"
          : "bg-white text-primary hover:bg-primary/10 dark:bg-gray-900"
      }`}
    >
      {icon}
    </button>
  );
        }


               
