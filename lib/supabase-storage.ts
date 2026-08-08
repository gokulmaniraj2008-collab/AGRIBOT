const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const ROBOT_IMAGE_BUCKET = "robot-images";

export function isSupabaseStorageConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function storageUrl(path = "") {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  return `${SUPABASE_URL}/storage/v1${path}`;
}

function headers(extra: Record<string, string> = {}) {
  if (!SUPABASE_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not configured");
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

export type RobotImage = {
  name: string;
  id?: string;
  updated_at?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
};

export async function listRobotImages(limit = 12): Promise<RobotImage[]> {
  const response = await fetch(storageUrl(`/object/list/${ROBOT_IMAGE_BUCKET}`), {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      limit,
      offset: 0,
      sortBy: { column: "created_at", order: "desc" },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Storage list failed (${response.status})`);
  }

  return response.json();
}

export function getPublicRobotImageUrl(path: string) {
  if (!SUPABASE_URL) return "";
  return `${SUPABASE_URL}/storage/v1/object/public/${ROBOT_IMAGE_BUCKET}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export async function uploadRobotImage(file: File, robotId = "robot-01") {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${robotId}/${new Date().toISOString().replace(/[:.]/g, "-")}-${safeName}`;

  const response = await fetch(storageUrl(`/object/${ROBOT_IMAGE_BUCKET}/${path}`), {
    method: "POST",
    headers: headers({ "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" }),
    body: file,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Storage upload failed (${response.status}): ${message}`);
  }

  return { path, url: getPublicRobotImageUrl(path) };
}
