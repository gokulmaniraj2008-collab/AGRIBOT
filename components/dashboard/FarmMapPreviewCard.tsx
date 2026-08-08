import Link from "next/link";
import { Map } from "lucide-react";

export function FarmMapPreviewCard() {
  return (
    <Link
      href="/farm"
      className="block bg-white border border-border rounded-card p-5 shadow-card hover:shadow-card-hover transition-shadow duration-200"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">Farm</h3>
        <Map size={16} className="text-text-secondary" />
      </div>
      <svg viewBox="0 0 300 120" className="w-full h-auto rounded-lg" aria-hidden="true">
        <rect width="300" height="120" rx="10" fill="#F1F5F3" />
        {[30, 70, 110, 150, 190, 230, 270].map((x) => (
          <line
            key={x}
            x1={x}
            y1="10"
            x2={x - 20}
            y2="110"
            stroke="#DCFCE7"
            strokeWidth="8"
            strokeLinecap="round"
          />
        ))}
        <circle cx="150" cy="60" r="5" fill="#16A34A" />
      </svg>
      <p className="mt-3 text-xs text-text-secondary">
        Tap to open the full farm map
      </p>
    </Link>
  );
}
