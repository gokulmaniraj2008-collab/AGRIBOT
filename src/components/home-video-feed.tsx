"use client";

import { Leaf } from "lucide-react";
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

export default function HomeVideoFeed({ videos }: { videos: HomeVideo[] }) {
  if (videos.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-4">
      {videos.map((v) => (
        <div
          key={v.id}
          className="flex flex-col rounded-xl border border-border bg-surface p-3 shadow-sm"
        >
          <video
            src={v.url}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-lg bg-black"
          />
          <div className="mt-3 flex items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Leaf className="h-4 w-4" />
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
  );
}
