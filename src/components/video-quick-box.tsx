"use client";

import { useState } from "react";
import { Film, Leaf, ChevronDown } from "lucide-react";
import type { HomeVideo } from "@/lib/types";

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function VideoQuickBox({ videos }: { videos: HomeVideo[] }) {
  const [open, setOpen] = useState(false);

  if (videos.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-3 shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="text-primary">
            <Film className="h-5 w-5" />
          </span>
          Watch Videos
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-4 border-t border-border pt-3">
          {videos.map((v) => (
            <div key={v.id} className="flex flex-col">
              <video
                src={v.url}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full rounded-lg bg-black"
              />
              <div className="mt-2 flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Leaf className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {v.title || "Untitled"}
                  </p>
                  <p className="text-xs text-muted">
                    AgriBot AI • {timeAgo(v.created_at)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
