export const AGRIBOT_TIME_ZONE = "Asia/Kolkata";

export function formatAgriBotTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: AGRIBOT_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function formatAgriBotTimeOnly(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-IN", {
    timeZone: AGRIBOT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}
