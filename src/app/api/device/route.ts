import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEVICE_ID = "agribot-01";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "AgriBot Device API",
    device: DEVICE_ID,
    status: "online",
    endpoints: {
      telemetry: "/api/device/telemetry",
      commands: "/api/device/commands",
    },
    timestamp: new Date().toISOString(),
  });
}
