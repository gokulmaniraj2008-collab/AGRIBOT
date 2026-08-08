import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PROMPT = `You are an agricultural assistant looking at a photo of a plant taken by a farm robot's camera.
Respond with ONLY a JSON object (no markdown fences, no extra text) with these exact keys:
{
  "plant": "best guess at plant/crop name, or 'Unclear' if not identifiable",
  "condition": "short name of any visible disease/pest/deficiency, or 'Healthy' if none visible",
  "confidence": integer 0-100, your own estimated confidence in this assessment,
  "severity": "Low" | "Moderate" | "High" | "None",
  "recommended_action": "one or two practical sentences, non-clinical, e.g. remove affected leaves, monitor irrigation"
}
This is an AI estimate from a single photo, not a lab diagnosis — keep the tone appropriately cautious.`;

const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

function extensionFor(mediaType: string) {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/heic") return "heic";
  return "jpg";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : null;
  const imageMediaType = typeof body?.imageMediaType === "string" ? body.imageMediaType : null;

  if (!imageBase64 || !imageMediaType) {
    return NextResponse.json(
      { error: "Provide 'imageBase64' and 'imageMediaType'." },
      { status: 400 }
    );
  }

  if (!ALLOWED_MEDIA_TYPES.includes(imageMediaType)) {
    return NextResponse.json(
      { error: `Unsupported image type. Must be one of: ${ALLOWED_MEDIA_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // 1. Upload the source image to the user's private Storage folder first,
  //    so we still have it on file even if Gemini or the JSON parse fails.
  const buffer = Buffer.from(imageBase64, "base64");
  if (buffer.byteLength > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Image exceeds the 5 MB limit." }, { status: 400 });
  }

  const path = `${user.id}/${crypto.randomUUID()}.${extensionFor(imageMediaType)}`;

  const { error: uploadError } = await supabase.storage
    .from("plant-images")
    .upload(path, buffer, { contentType: imageMediaType, upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: `Could not store image: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // 2. Call Gemini for the analysis.
  const model = "gemini-2.5-flash";
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    model +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  let answer = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: imageMediaType, data: imageBase64 } },
              { text: PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Gemini request failed (${res.status}).` }, { status: 502 });
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    answer =
      candidate?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("\n")
        .trim() || "";
  } catch {
    return NextResponse.json({ error: "Network error reaching Gemini." }, { status: 502 });
  }

  // 3. Parse the JSON Gemini returned. If it isn't clean JSON, persist the
  //    raw text instead of silently dropping the analysis.
  type Parsed = {
    plant?: string;
    condition?: string;
    confidence?: number;
    severity?: string;
    recommended_action?: string;
  };
  let parsed: Parsed | null = null;
  try {
    parsed = JSON.parse(answer.replace(/```json|```/g, "").trim());
  } catch {
    parsed = null;
  }

  const { data: row, error: insertError } = await supabase
    .from("plant_analysis")
    .insert({
      user_id: user.id,
      image_path: path,
      plant: parsed?.plant ?? null,
      condition: parsed?.condition ?? null,
      confidence: typeof parsed?.confidence === "number" ? parsed.confidence : null,
      severity: parsed?.severity ?? null,
      recommended_action: parsed?.recommended_action ?? null,
      raw_response: parsed ? null : answer || null,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: `Analysis succeeded but could not be saved: ${insertError.message}` },
      { status: 500 }
    );
  }

  const { data: signed } = await supabase.storage
    .from("plant-images")
    .createSignedUrl(path, 3600);

  return NextResponse.json({
    id: row.id,
    image_path: path,
    signed_url: signed?.signedUrl ?? null,
    plant: row.plant,
    condition: row.condition,
    confidence: row.confidence,
    severity: row.severity,
    recommended_action: row.recommended_action,
    raw_answer: row.raw_response,
  });
      }
         
