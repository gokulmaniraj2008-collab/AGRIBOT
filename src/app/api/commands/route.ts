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
  "heater_on",
  "heater_off",
  "cooler_on",
  "cooler_off",
  "vent_on",
  "vent_off",
  "set_irrigation_auto_on",
  "set_irrigation_auto_off",
  "set_irrigation_threshold",
  "set_ventilation_auto_on",
  "set_ventilation_auto_off",
  "set_target_temp_min",
  "set_target_temp_max",
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

  return NextResponse.json({ success: true, command: data });
}
