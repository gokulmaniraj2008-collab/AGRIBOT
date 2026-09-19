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
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || body.robot_id !== DEVICE_ID) {
    return NextResponse.json({ error: "Invalid robot_id" }, { status: 400 });
  }

  const supabase = adminClient();
  const sensor = {
    robot_id: DEVICE_ID,
    soil_moisture: Number.isFinite(body.soil_moisture) ? body.soil_moisture : null,
    temperature: Number.isFinite(body.temperature) ? body.temperature : null,
    humidity: Number.isFinite(body.humidity) ? body.humidity : null,
    distance_cm: Number.isFinite(body.distance_cm) ? body.distance_cm : null,
    battery_voltage: Number.isFinite(body.battery_voltage) ? body.battery_voltage : null,
    battery_percent: Number.isFinite(body.battery_percent) ? body.battery_percent : null,
    latitude: Number.isFinite(body.latitude) ? body.latitude : null,
    longitude: Number.isFinite(body.longitude) ? body.longitude : null,
    plant_index: Number.isInteger(body.plant_index) ? body.plant_index : null,
  };

  const status = {
    robot_id: DEVICE_ID,
    name: "AgriBot 01",
    updated_at: new Date().toISOString(),
    online: true,
    mode: body.mode === "auto" ? "auto" : "manual",
    pump_status: !!body.pump_status,
    motor_state: ["stopped", "forward", "backward", "left", "right"].includes(body.motor_state)
      ? body.motor_state
      : "stopped",
    speed_value: Number.isFinite(body.speed_value) ? Math.max(0, Math.min(255, body.speed_value)) : 0,
    irrigation_auto: !!body.irrigation_auto,
    irrigation_threshold: Number.isFinite(body.irrigation_threshold) ? body.irrigation_threshold : 30,
    gps_fix: !!body.gps_fix,
    gps_satellites: Number.isInteger(body.gps_satellites) ? body.gps_satellites : null,
    last_latitude: Number.isFinite(body.latitude) ? body.latitude : null,
    last_longitude: Number.isFinite(body.longitude) ? body.longitude : null,
    safety_stopped: !!body.safety_stopped,
    last_fault: body.last_fault || null,
    last_fault_at: body.last_fault_at || null,
  };

  const [{ error: sensorError }, { error: statusError }] = await Promise.all([
    supabase.from("sensor_data").insert(sensor),
    supabase.from("robot_status").upsert(status, { onConflict: "robot_id" }),
  ]);

  if (sensorError || statusError) {
    return NextResponse.json(
      { error: sensorError?.message ?? statusError?.message ?? "Telemetry write failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
