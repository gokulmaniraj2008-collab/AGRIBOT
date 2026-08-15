import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { RobotCommand } from "@/lib/types";

const VALID_COMMANDS: RobotCommand[] = [
  "forward",
  "backward",
  "left",
  "right",
  "stop",
  "pump_on",
  "pump_off",
  "set_speed",
  "set_mode_auto",
  "set_mode_manual",
  "set_irrigation_auto_on",
  "set_irrigation_auto_off",
  "set_irrigation_threshold",
  "patrol_row",
  "save_plant_location",
  "goto_plant",
];

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.command !== "string") {
    return NextResponse.json(
      { error: "Request body must include a 'command' string." },
      { status: 400 }
    );
  }

  const command = body.command as string;
  const value = typeof body.value === "number" ? body.value : null;
  const robot_id =
    typeof body.robot_id === "string" ? body.robot_id : "agribot-01";

  if (!VALID_COMMANDS.includes(command as RobotCommand)) {
    return NextResponse.json(
      { error: `Invalid command. Must be one of: ${VALID_COMMANDS.join(", ")}` },
      { status: 400 }
    );
  }

  if (command === "set_speed" && (value === null || value < 0 || value > 255)) {
    return NextResponse.json(
      { error: "set_speed requires a numeric 'value' between 0 and 255." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("robot_commands")
    .insert({ robot_id, command, value })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mirror the command into the message log so "Recent Commands" and
  // "Message Log" stay in sync. Best-effort: a failure here shouldn't
  // fail the command itself.
  const { error: msgError } = await supabase.from("device_messages").insert({
    robot_id,
    origin: "website",
    level: "info",
    message: describeCommand(command, value),
  });
  if (msgError) {
    console.error("Failed to log device message for command:", msgError.message);
  }

  return NextResponse.json({ success: true, command: data });
}

function describeCommand(command: string, value: number | null): string {
  switch (command) {
    case "forward":
      return "Sent command: move forward";
    case "backward":
      return "Sent command: move backward";
    case "left":
      return "Sent command: turn left";
    case "right":
      return "Sent command: turn right";
    case "stop":
      return "Sent command: stop";
    case "pump_on":
      return "Sent command: turn pump ON";
    case "pump_off":
      return "Sent command: turn pump OFF";
    case "set_speed":
      return `Sent command: set speed to ${value ?? "?"}`;
    case "set_mode_auto":
      return "Sent command: switch to auto mode";
    case "set_mode_manual":
      return "Sent command: switch to manual mode";
    case "set_irrigation_auto_on":
      return "Sent command: enable auto irrigation";
    case "set_irrigation_auto_off":
      return "Sent command: disable auto irrigation";
    case "set_irrigation_threshold":
      return `Sent command: set irrigation threshold to ${value ?? "?"}`;
    case "patrol_row":
      return `Sent command: patrol and check ${value ?? "?"} plant(s)`;
    case "save_plant_location":
      return `Sent command: save current GPS spot as plant ${value ?? "?"}`;
    case "goto_plant":
      return `Sent command: go to plant ${value ?? "?"}`;
    default:
      return `Sent command: ${command}${value != null ? ` (${value})` : ""}`;
  }
}
  
