"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadVideoToCloudinary } from "@/lib/cloudinary";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, IconTile } from "@/components/ui-kit";
import type { HomeVideo } from "@/lib/types";
import { Film, Upload, CheckCircle2, Trash2, ArrowLeft } from "lucide-react";

export default function AdminVideosPage() {
  const supabase = createClient();
  const router = useRouter();
  const [homeVideos, setHomeVideos] = useState<HomeVideo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("home_videos")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<HomeVideo[]>()
      .then(({ data }) => {
        if (!cancelled && data) setHomeVideos(data);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setBusy("video");

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(0);
        const url = await uploadVideoToCloudinary(file, (pct) =>
          setUploadProgress(pct)
        );

        const nextOrder =
          homeVideos.length > 0
            ? Math.max(...homeVideos.map((v) => v.sort_order)) + 1
            : 0;

        const { data, error: err } = await supabase
          .from("home_videos")
          .insert({
            url,
            title: file.name.replace(/\.[^/.]+$/, ""),
            sort_order: nextOrder,
          })
          .select()
          .single<HomeVideo>();

        if (err) throw err;
        if (data) setHomeVideos((prev) => [...prev, data]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeHomeVideo(id: number) {
    setBusy(`video-remove-${id}`);
    setError(null);
    const { error: err } = await supabase
      .from("home_videos")
      .delete()
      .eq("id", id);
    if (err) setError(err.message);
    else setHomeVideos((prev) => prev.filter((v) => v.id !== id));
    setBusy(null);
  }

  return (
    <DashboardShell title="Home Page Videos" subtitle="Admin" isAdmin>
      <>
        <button
          onClick={() => router.push("/admin")}
          className="mb-4 flex items-center gap-1 text-xs font-medium text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Admin
        </button>

        {error && (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-xs font-medium text-danger">
            {error}
          </div>
        )}

        <Card className="p-4">
          <div className="mb-1 flex items-center gap-2.5">
            <IconTile icon={Film} size={32} />
            <span className="text-sm font-semibold text-foreground dark:text-gray-100">
              Home Page Videos
            </span>
          </div>
          <p className="mb-4 text-xs text-muted dark:text-gray-400">
            Uploads directly to Cloudinary. Each video appears in a
            swipeable row on the Dashboard, immediately for all users.
            Select multiple files at once to upload several together.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            onChange={handleVideoUpload}
            className="hidden"
            id="home-video-input"
          />
          <label
            htmlFor="home-video-input"
            className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] ${
              busy === "video"
                ? "bg-primary/60"
                : "bg-primary hover:bg-primaryDark"
            }`}
          >
            <Upload className="h-4 w-4" />
            {busy === "video"
              ? uploadProgress != null
                ? `Uploading… ${uploadProgress}%`
                : "Uploading…"
              : "Choose & Upload Video(s)"}
          </label>

          {homeVideos.length === 0 ? (
            <p className="mt-4 text-xs text-muted dark:text-gray-400">
              No videos uploaded yet.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {homeVideos.map((v) => (
                <div
                  key={v.id}
                  className="overflow-hidden rounded-xl border border-border dark:border-gray-800"
                >
                  <video
                    src={v.url}
                    controls
                    className="aspect-video w-full bg-black"
                  />
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground dark:text-gray-100">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      {v.title || "Untitled"}
                    </span>
                    <button
                      onClick={() => removeHomeVideo(v.id)}
                      disabled={busy === `video-remove-${v.id}`}
                      className="flex items-center gap-1 rounded-lg border border-danger/30 bg-white px-2 py-1 text-xs font-medium text-danger transition hover:bg-danger/5 disabled:opacity-50 dark:bg-gray-900"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {busy === `video-remove-${v.id}`
                        ? "Removing…"
                        : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </>
    </DashboardShell>
  );
}
