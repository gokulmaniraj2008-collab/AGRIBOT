"use client";

import dynamic from "next/dynamic";

export const PlantsMapLoader = dynamic(
  () => import("./plants-map").then((m) => m.PlantsMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-surface text-sm text-muted dark:bg-gray-900 dark:text-gray-400">
        Loading map…
      </div>
    ),
  }
);
