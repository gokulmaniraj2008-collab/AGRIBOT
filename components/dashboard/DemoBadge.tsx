import { FlaskConical } from "lucide-react";

export function DemoBadge({ label = "DEMO DATA" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/10 text-warning text-xs font-semibold">
      <FlaskConical size={12} />
      {label}
    </span>
  );
}
