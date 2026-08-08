"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Camera as CameraIcon, Loader2, AlertTriangle, Leaf, History } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { PlantAnalysis } from "@/lib/types";

type Analysis = {
  plant?: string | null;
  condition?: string | null;
  confidence?: number | null;
  severity?: "Low" | "Moderate" | "High" | string | null;
  recommended_action?: string | null;
};

type HistoryItem = PlantAnalysis & { signed_url: string | null };

function fileToBase64(file: File): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [, data] = result.split(",");
      resolve({ data, mediaType: file.type || "image/jpeg" });
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function PlantAnalysis() {
  const supabase = createClient();
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [rawAnswer, setRawAnswer] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const { data: rows } = await supabase
      .from("plant_analysis")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<PlantAnalysis[]>();

    if (!rows || rows.length === 0) {
      setHistory([]);
      setHistoryLoading(false);
      return;
    }

    const paths = rows.map((r) => r.image_path);
    const { data: signedList } = await supabase.storage
      .from("plant-images")
      .createSignedUrls(paths, 3600);

    const urlByPath = new Map(
      (signedList ?? []).map((s) => [s.path, s.signedUrl as string | undefined])
    );

    setHistory(
      rows.map((r) => ({ ...r, signed_url: urlByPath.get(r.image_path) ?? null }))
    );
    setHistoryLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setResult(null);
    setRawAnswer(null);
    setPreview(URL.createObjectURL(file));
    setLoading(true);
    try {
      const { data, mediaType } = await fileToBase64(file);
      const res = await fetch("/api/plant-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: data, imageMediaType: mediaType }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Analysis request failed.");
        return;
      }
      if (json.raw_answer) {
        // Server-side JSON parse failed — show what Gemini actually said
        // rather than hiding it. The photo was still saved.
        setRawAnswer(json.raw_answer);
      } else {
        setResult({
          plant: json.plant,
          condition: json.condition,
          confidence: json.confidence,
          severity: json.severity,
          recommended_action: json.recommended_action,
        });
      }
      loadHistory();
    } catch {
      setError("Network error reaching the analysis service.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-sm font-bold text-foreground dark:text-gray-100">AI Plant Analysis</p>
      <p className="mt-0.5 text-xs text-muted dark:text-gray-400">
        Upload or capture a photo — analyzed live via Gemini and saved to your history.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface dark:border-gray-700 dark:bg-gray-950">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Selected plant" className="h-full w-full object-cover" />
          ) : (
            <Upload className="h-6 w-6 text-muted" />
          )}
        </div>

        <div className="flex flex-col justify-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primaryDark active:scale-[0.98]"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Image
          </button>
          <button
            onClick={() => captureInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-white py-2.5 text-xs font-semibold text-foreground transition hover:bg-surface active:scale-[0.98] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <CameraIcon className="h-3.5 w-3.5" />
            Capture Image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={captureInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-xs font-medium text-muted dark:bg-gray-800 dark:text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analyzing photo…
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2.5 text-xs font-medium text-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {rawAnswer && (
        <div className="mt-3 rounded-xl bg-surface p-3 text-xs leading-relaxed text-foreground dark:bg-gray-800 dark:text-gray-200">
          {rawAnswer}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-xl bg-surface p-3.5 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <Leaf className="h-4 w-4 text-primary" />
            <p className="text-sm font-bold text-foreground dark:text-gray-100">
              {result.plant || "Unclear"}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted dark:text-gray-400">Condition</p>
          <p className="text-sm font-semibold text-foreground dark:text-gray-100">
            {result.condition || "—"}
          </p>

          {typeof result.confidence === "number" && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[11px] text-muted dark:text-gray-400">
                <span>AI confidence (estimate)</span>
                <span className="font-semibold text-foreground dark:text-gray-200">
                  {result.confidence}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(0, Math.min(100, result.confidence))}%` }}
                />
              </div>
            </div>
          )}

          {result.severity && (
            <p className="mt-2 inline-flex items-center rounded-full bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning">
              Severity: {result.severity}
            </p>
          )}

          {result.recommended_action && (
            <div className="mt-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted dark:text-gray-400">
                Recommended action
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground dark:text-gray-200">
                {result.recommended_action}
              </p>
            </div>
          )}

          <p className="mt-3 text-[10px] leading-relaxed text-muted dark:text-gray-500">
            AI-generated estimate from a single photo, not a lab diagnosis. Confirm before treating.
          </p>
        </div>
      )}

      <div className="mt-4 border-t border-border pt-3 dark:border-gray-800">
        <div className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-muted dark:text-gray-400" />
          <p className="text-xs font-semibold text-foreground dark:text-gray-100">
            Recent Analyses
          </p>
        </div>

        {historyLoading ? (
          <p className="mt-2 text-[11px] text-muted dark:text-gray-500">Loading…</p>
        ) : history.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted dark:text-gray-500">
            Your saved analyses will show up here.
          </p>
        ) : (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {history.map((h) => (
              <div
                key={h.id}
                className="w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-surface dark:border-gray-800 dark:bg-gray-950"
              >
                <div className="flex h-16 w-full items-center justify-center overflow-hidden bg-white dark:bg-gray-900">
                  {h.signed_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.signed_url} alt={h.plant ?? "Analyzed plant"} className="h-full w-full object-cover" />
                  ) : (
                    <Leaf className="h-4 w-4 text-muted" />
                  )}
                </div>
                <div className="p-1.5">
                  <p className="truncate text-[10px] font-semibold text-foreground dark:text-gray-100">
                    {h.plant || "Unclear"}
                  </p>
                  <p className="truncate text-[9px] text-muted dark:text-gray-400">
                    {h.condition || (h.raw_response ? "See notes" : "—")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
  
