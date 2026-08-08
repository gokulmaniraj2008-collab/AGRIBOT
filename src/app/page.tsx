"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Leaf } from "lucide-react";

export default function SplashPage() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const leaveTimer = setTimeout(() => setLeaving(true), 1500);
    const navTimer = setTimeout(() => router.push("/welcome"), 1850);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(navTimer);
    };
  }, [router]);

  return (
    <main
      className={`flex min-h-screen flex-col items-center justify-center bg-background px-6 transition-opacity duration-300 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex animate-logo-pop flex-col items-center gap-4">
        <div className="rounded-2xl bg-primary/10 p-5">
          <Leaf className="h-12 w-12 text-primary" strokeWidth={2.2} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Agri<span className="text-primary">Bot</span> AI
        </h1>
      </div>

      <p
        className="mt-3 animate-fade-in text-sm text-muted"
        style={{ animationDelay: "0.35s" }}
      >
        Smart Farming. Better Tomorrow.
      </p>

      <div className="mt-10 h-1 w-24 overflow-hidden rounded-full bg-border">
        <div className="h-full w-full origin-left animate-loading-bar rounded-full bg-primary" />
      </div>
    </main>
  );
}
