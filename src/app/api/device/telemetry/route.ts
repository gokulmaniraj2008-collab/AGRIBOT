import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DEVICE_ID = "agribot-01";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function authorized(request: NextRequest) {
  const expected = process.env.AGRIBOT_DEVICE_TOKEN;
  return !!expected && request.headers.get("x-agribot-device-token") === expected;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || body.robot_id !== DEVICE_ID) {
    return NextResponse.json({ error: "Invalid robot_id" }, { status: 400 });
  }

  const supabase = adminClient();

  // Keep the database contract intentionally small: the ESP32 telemetry
  // is stored in the public.agribot_log table.
  const log = {
    status: body.status === "STOPPED" ? "STOPPED" : "RUNNING",
    distance_cm: Number.isFinite(body.distance_cm) ? Math.round(body.distance_cm) : null,
    soil_pct: Number.isFinite(body.soil_moisture)
      ? Math.max(0, Math.min(100, Math.round(body.soil_moisture)))
      : null,
    temp_c: Number.isFinite(body.temperature) ? body.temperature : null,
    hum_pct: Number.isFinite(body.humidity) ? body.humidity : null,
    relay: typeof body.pump_status === "boolean" ? body.pump_status : null,
    motor:
      typeof body.motor_state === "string" && body.motor_state.length <= 32
        ? body.motor_state
        : "stopped",
  };

  const { error } = await supabase.from("agribot_log").insert(log);

  if (error) {
    return NextResponse.json(
      { error: error.message || "Telemetry write failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
