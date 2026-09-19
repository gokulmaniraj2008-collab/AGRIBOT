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

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("agribot_commands")
    .select("*")
    .eq("robot_id", DEVICE_ID)
    .eq("executed", false)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ command: data?.[0] ?? null });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || !Number.isInteger(body.id)) {
    return NextResponse.json({ error: "Command id is required" }, { status: 400 });
  }

  const supabase = adminClient();
  const { error } = await supabase
    .from("agribot_commands")
    .update({ executed: true, executed_at: new Date().toISOString() })
    .eq("id", body.id)
    .eq("robot_id", DEVICE_ID)
    .eq("executed", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
