import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

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
    .from("device_messages")
    .select("*")
    .eq("robot_id", DEVICE_ID)
    .eq("origin", "website")
    .eq("read", false)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: data?.[0] ?? null });
}

export async function POST(request: NextRequest) {
  const app = await createServerClient();
  const { data: { user } } = await app.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json({ error: "A non-empty message is required" }, { status: 400 });
  }

  const message = body.message.trim().slice(0, 500);
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("device_messages")
    .insert({
      robot_id: DEVICE_ID,
      origin: "website",
      level: typeof body.level === "string" ? body.level : "info",
      message,
      read: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, message: data });
}
