import { describe, expect, it } from "vitest";
import {
  classifyLogKind,
  deriveSystemStatus,
  groupLogsIntoSessions,
  matchesFilter,
  selfCheckState,
} from "../src/lib/log-grouping";
import type { RobotLog } from "../src/lib/types";

const log = (
  id: number,
  event_type: string,
  message: string,
  created_at = `2026-09-13T10:00:0${id}Z`
): RobotLog => ({
  id,
  created_at,
  robot_id: "agribot-01",
  plant_id: null,
  event_type,
  message,
  value: null,
});

describe("classifyLogKind", () => {
  it("treats camera errors as warnings because camera is optional", () => {
    expect(classifyLogKind(log(1, "CAMERA", "ERROR: camera unavailable"))).toBe("warning");
  });

  it("classifies hardware errors and warning markers", () => {
    expect(classifyLogKind(log(2, "SOIL", "ERROR: sensor read failed"))).toBe("error");
    expect(classifyLogKind(log(3, "ULTRASONIC", "OBSTACLE detected"))).toBe("warning");
  });

  it("recognizes successful robot events", () => {
    expect(classifyLogKind(log(4, "ROBOT", "Patrol STARTED"))).toBe("success");
  });
});

describe("groupLogsIntoSessions", () => {
  it("keeps logs instead of silently dropping them", () => {
    const sessions = groupLogsIntoSessions([
      log(3, "SOIL", "Dry"),
      log(2, "ROBOT", "Moving forward"),
      log(1, "ROBOT", "System starting"),
    ]);

    expect(sessions).toHaveLength(2);
    expect(sessions[0].kind).toBe("patrol");
    expect(sessions[1].kind).toBe("self_check");
    expect(sessions[0].logs).toHaveLength(2);
    expect(sessions[1].logs).toHaveLength(1);
    expect(sessions[0].logs.map((entry) => entry.id)).toEqual([2, 3]);
  });

  it("does not claim a patrol succeeded without its success marker", () => {
    const sessions = groupLogsIntoSessions([
      log(3, "ROBOT", "Obstacle detected"),
      log(2, "ROBOT", "Moving forward"),
    ]);

    expect(sessions[0].outcome).toBe("unclear");
  });

  it("recognizes an ultrasonic failure chain", () => {
    const sessions = groupLogsIntoSessions([
      log(3, "ULTRASONIC", "ERROR: no echo"),
      log(2, "ROBOT", "Continuing patrol"),
      log(1, "ROBOT", "Moving forward"),
    ]);

    expect(sessions[0].outcome).toBe("ultrasonic_failure");
    expect(sessions[0].failureChain?.kind).toBe("ultrasonic");
  });
});

describe("derived status and filters", () => {
  it("uses the newest known component log and keeps unknowns honest", () => {
    const status = deriveSystemStatus([
      log(5, "SOIL", "ERROR: read failed"),
      log(4, "ROBOT", "Moving forward"),
    ]);

    expect(status.robot).toBe("MOVING");
    expect(status.soil).toBe("ERROR");
    expect(status.gps).toBe("Unknown");
  });

  it("matches component and error filters consistently", () => {
    const error = log(1, "SOIL", "ERROR: sensor failed");
    const pump = log(2, "PUMP", "Watering started");

    expect(matchesFilter(error, "ERRORS")).toBe(true);
    expect(matchesFilter(error, "PUMP")).toBe(false);
    expect(matchesFilter(pump, "WATERING")).toBe(true);
  });
});

describe("selfCheckState", () => {
  it("maps explicit firmware states without inventing a result", () => {
    expect(selfCheckState("DHT22: OK").state).toBe("ok");
    expect(selfCheckState("GPS: ACQUIRING").state).toBe("warn");
    expect(selfCheckState("Servo: ERROR").state).toBe("error");
    expect(selfCheckState("Some future firmware message").state).toBe("neutral");
  });
});
