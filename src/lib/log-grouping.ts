/**
 * Activity Log presentation helpers.
 *
 * IMPORTANT: this file never fetches, mutates, or deletes anything — it
 * only re-interprets the RobotLog rows the caller already has in memory
 * (id, created_at, robot_id, plant_id, event_type, message, value) so the
 * UI can group and label them more clearly. Every row that comes in still
 * comes out somewhere; nothing is dropped, only re-arranged/annotated.
 *
 * The grouping relies on the exact literal strings the ESP32 firmware
 * writes (see firmware-reference/agribot_main.ino, logEvent() calls) —
 * it does not guess at hardware state beyond what a message already says.
 */
import type { RobotLog } from "@/lib/types";

export type LogKind = "error" | "skipped" | "warning" | "success" | "info";

export type LogTone = "success" | "warning" | "danger" | "muted" | "info";

/** Classifies a single row's message so the UI can color/badge it consistently. */
export function classifyLogKind(log: RobotLog): LogKind {
  const msg = log.message.toUpperCase();
  const type = log.event_type.toUpperCase();

  // Camera problems always fail open on the robot (patrol continues), so
  // they're never shown as a critical error — see requirement: camera is
  // optional.
  if (type === "CAMERA" && msg.includes("ERROR")) return "warning";

  if (msg.startsWith("ERROR") || msg.includes("ERROR:") || msg.includes("ERROR -")) {
    return "error";
  }
  if (msg.includes("SKIPPED")) return "skipped";

  const warningMarkers = [
    "NOT CONNECTED",
    "WAITING",
    "ACQUIRING",
    "NO RESPONSE",
    "UNAVAILABLE",
    "NO ECHO",
    "UNTESTED",
    "NOT SAVED",
    "NOT VERIFIED",
    "DISABLED",
    "NOT_PLANT",
    "SUFFICIENT", // "Soil moisture sufficient" / "Watering not required"
    "FAILED",
    "GAVE UP",
    "TIMEOUT",
    "STOPPED EARLY",
    "OBSTACLE",
  ];
  if (warningMarkers.some((m) => msg.includes(m))) return "warning";

  if (type === "ROBOT" && msg === "STOPPED") return "info";

  const successMarkers = [
    "CONFIRMED",
    "CONNECTED",
    "SAVED",
    "COMPLETED",
    " PLANT",
    "DRY",
    "WET",
    "READY",
    "STARTED",
    ": OK",
  ];
  if (successMarkers.some((m) => msg.includes(m))) return "success";

  return "info";
}

export function toneForKind(kind: LogKind): LogTone {
  switch (kind) {
    case "error":
      return "danger";
    case "skipped":
      return "muted";
    case "warning":
      return "warning";
    case "success":
      return "success";
    default:
      return "info";
  }
}

function isSessionStart(log: RobotLog): "self_check" | "patrol" | null {
  if (log.event_type !== "ROBOT") return null;
  if (log.message === "System starting") return "self_check";
  if (log.message === "Moving forward") return "patrol";
  return null;
}

export type FailureChainKind = "ultrasonic" | "servo";

export type LogSession = {
  id: string;
  kind: "self_check" | "patrol" | "other";
  plantId: number | null;
  /** Chronological, oldest first, within the session. */
  logs: RobotLog[];
  startedAt: string;
  endedAt: string;
  outcome?: "success" | "ultrasonic_failure" | "servo_failure" | "unclear";
  /** Index into `logs` where the recognized failure chain begins. */
  failureChain?: { anchorIndex: number; kind: FailureChainKind } | null;
};

/**
 * Groups a (newest-first) list of logs into sessions using the robot's own
 * "Moving forward" / "System starting" markers as session boundaries —
 * these are logged by the firmware at the start of every patrol attempt
 * and every boot, so they're a reliable, un-fabricated anchor. Anything
 * logged before the first recognized marker is kept as an "other" session
 * so no row is ever discarded.
 */
export function groupLogsIntoSessions(logsNewestFirst: RobotLog[]): LogSession[] {
  const asc = [...logsNewestFirst].reverse();
  const sessions: LogSession[] = [];
  let current: LogSession | null = null;
  const leading: RobotLog[] = [];

  for (const log of asc) {
    const startKind = isSessionStart(log);
    if (startKind) {
      if (current) sessions.push(current);
      current = {
        id: `session-${log.id}`,
        kind: startKind,
        plantId: log.plant_id,
        logs: [log],
        startedAt: log.created_at,
        endedAt: log.created_at,
      };
    } else if (current) {
      current.logs.push(log);
      current.endedAt = log.created_at;
    } else {
      leading.push(log);
    }
  }
  if (current) sessions.push(current);

  if (leading.length) {
    sessions.unshift({
      id: `session-leading-${leading[0].id}`,
      kind: "other",
      plantId: leading[0].plant_id,
      logs: leading,
      startedAt: leading[0].created_at,
      endedAt: leading[leading.length - 1].created_at,
    });
  }

  for (const session of sessions) {
    if (session.kind !== "patrol") continue;

    const ultraErrIdx = session.logs.findIndex(
      (l) => l.event_type === "ULTRASONIC" && l.message.startsWith("ERROR")
    );
    const servoErrIdx = session.logs.findIndex(
      (l) => l.event_type === "SERVO" && l.message.startsWith("ERROR")
    );

    if (ultraErrIdx !== -1) {
      session.outcome = "ultrasonic_failure";
      session.failureChain = { anchorIndex: ultraErrIdx, kind: "ultrasonic" };
    } else if (servoErrIdx !== -1) {
      session.outcome = "servo_failure";
      session.failureChain = { anchorIndex: servoErrIdx, kind: "servo" };
    } else if (
      session.logs.some((l) => l.event_type === "ROBOT" && l.message.startsWith("Continuing patrol"))
    ) {
      session.outcome = "success";
    } else {
      // Ended some other way (obstacle, timeout, still in progress, or an
      // older log shape) — we don't have a distinct robot_logs marker for
      // those, so we don't claim one. The session still renders normally,
      // just without a banner.
      session.outcome = "unclear";
    }
  }

  return sessions.reverse(); // newest session first
}

export type SoilPumpLink = { role: "cause" | "consequence"; note: string };

/**
 * Finds the SOIL sensor-error -> PUMP skipped pairing within a session so
 * the UI can show them as linked (cause/consequence) instead of two
 * unrelated hardware failures. Returns a map keyed by log id.
 */
export function findSoilPumpLinks(sessionLogs: RobotLog[]): Record<number, SoilPumpLink> {
  const links: Record<number, SoilPumpLink> = {};

  sessionLogs.forEach((log, idx) => {
    if (log.event_type === "SOIL" && log.message.startsWith("ERROR")) {
      const consequenceIdx = sessionLogs.findIndex(
        (l, i) => i > idx && l.event_type === "PUMP" && l.message.toUpperCase().includes("SOIL ERROR")
      );
      if (consequenceIdx !== -1) {
        links[log.id] = {
          role: "cause",
          note: "Pump watering was skipped below because of this reading — not a pump failure.",
        };
        links[sessionLogs[consequenceIdx].id] = {
          role: "consequence",
          note: "Skipped because the soil sensor reading above failed — not a pump hardware fault.",
        };
      }
    }
  });

  return links;
}

export type SystemStatus = {
  robot: string;
  ultrasonic: string;
  servo: string;
  soil: string;
  camera: string;
  gps: string;
  pump: string;
};

/**
 * Derives the "latest known state" strip at the top of the Activity Log
 * from the most recent row per component. Only reflects what's actually
 * in the logs — falls back to "Unknown" rather than guessing.
 */
export function deriveSystemStatus(logsNewestFirst: RobotLog[]): SystemStatus {
  const latest: Partial<Record<string, RobotLog>> = {};
  for (const log of logsNewestFirst) {
    if (!latest[log.event_type]) latest[log.event_type] = log;
  }

  const robotMsg = latest.ROBOT?.message ?? "";
  let robot = "Unknown";
  if (/system starting/i.test(robotMsg)) robot = "STARTING";
  else if (/moving forward|continuing patrol/i.test(robotMsg)) robot = "MOVING";
  else if (/waiting/i.test(robotMsg)) robot = "WAITING";
  else if (/stopped/i.test(robotMsg)) robot = "STOPPED";

  const usMsg = latest.ULTRASONIC?.message ?? "";
  let ultrasonic = "Unknown";
  if (/error|unavailable/i.test(usMsg)) ultrasonic = "ERROR";
  else if (/confirmed|: ok/i.test(usMsg)) ultrasonic = "OK";
  else if (/checking|reading|no echo/i.test(usMsg)) ultrasonic = "WAITING";

  const servoMsg = latest.SERVO?.message ?? "";
  let servo = "NOT VERIFIED";
  if (/error/i.test(servoMsg)) servo = "ERROR";
  else if (/: ok|probe (down|up)|checking/i.test(servoMsg)) servo = "CONTROL READY";

  const soilMsg = latest.SOIL?.message ?? "";
  let soil = "Unknown";
  if (/error/i.test(soilMsg)) soil = "ERROR";
  else if (/: ok|dry|wet|raw value|moisture|reading/i.test(soilMsg)) soil = "OK";

  const camMsg = latest.CAMERA?.message ?? "";
  let camera = "NOT CONNECTED";
  if (/^connected$|connected$|result:/i.test(camMsg)) camera = "CONNECTED";
  else if (/checking/i.test(camMsg)) camera = "OPTIONAL";

  const gpsMsg = latest.GPS?.message ?? "";
  let gps = "Unknown";
  if (/location saved/i.test(gpsMsg)) gps = "FIXED";
  else if (/acquiring/i.test(gpsMsg)) gps = "ACQUIRING";
  else if (/unavailable|not saved|save failed/i.test(gpsMsg)) gps = "UNAVAILABLE";

  const pumpMsg = latest.PUMP?.message ?? "";
  let pump = "READY";
  if (/watering started|^on$/i.test(pumpMsg)) pump = "WATERING";
  else if (/^off$|completed|not required|skipped/i.test(pumpMsg)) pump = "READY";

  return { robot, ultrasonic, servo, soil, camera, gps, pump };
}

export type LogFilter =
  | "ALL"
  | "ROBOT"
  | "ULTRASONIC"
  | "SERVO"
  | "SOIL"
  | "PUMP"
  | "GPS"
  | "CAMERA"
  | "ERRORS"
  | "WARNINGS"
  | "WATERING";

export const LOG_FILTERS: LogFilter[] = [
  "ALL",
  "ROBOT",
  "ULTRASONIC",
  "SERVO",
  "SOIL",
  "PUMP",
  "GPS",
  "CAMERA",
  "ERRORS",
  "WARNINGS",
  "WATERING",
];

export function matchesFilter(log: RobotLog, filter: LogFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "ERRORS") return classifyLogKind(log) === "error";
  if (filter === "WARNINGS") return classifyLogKind(log) === "warning";
  if (filter === "WATERING") return log.event_type === "PUMP";
  return log.event_type === filter;
}

/** Interprets one self-check line's message into a short status + icon state, without inventing values it doesn't have. */
export function selfCheckState(message: string): { label: string; state: "ok" | "warn" | "error" | "neutral" } {
  const msg = message.toUpperCase();
  if (msg.includes("ERROR")) return { label: message, state: "error" };
  if (msg.includes(": OK") || msg === "STATUS: OK") return { label: message, state: "ok" };
  if (msg.includes("NOT CONNECTED") || msg.includes("UNTESTED") || msg.includes("ACQUIRING") || msg.includes("NO ECHO")) {
    return { label: message, state: "warn" };
  }
  return { label: message, state: "neutral" };
  }
