import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const imageBase64 =
    typeof body?.imageBase64 === "string" ? body.imageBase64 : null;
  const imageMediaType =
    typeof body?.imageMediaType === "string" ? body.imageMediaType : null;

  if (!text && !imageBase64) {
    return NextResponse.json(
      { error: "Provide 'text' and/or an image." },
      { status: 400 }
    );
  }

  const parts: Record<string, unknown>[] = [];
  if (imageBase64 && imageMediaType) {
    parts.push({
      inline_data: { mime_type: imageMediaType, data: imageBase64 },
    });
  }
  parts.push({ text: text || "Describe what is in this image." });

  const model = "gemini-2.5-flash";
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    model +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Gemini request failed (${res.status}).` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const answer: string =
      candidate?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("\n")
        .trim() || "(no response)";

    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json(
      { error: "Network error reaching Gemini." },
      { status: 502 }
    );
  }
      }
