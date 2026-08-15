"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { SectionHeading, ProgressRing, StatusBadge, IconTile } from "@/components/ui-kit";
import { createClient } from "@/lib/supabase/client";
import PlantAnalysis from "./plant-analysis";
import type { RobotStatus, SensorReading } from "@/lib/types";
import {
  Sparkles, Type, Image as ImageIcon, Mic, Volume2, VolumeX,
  Droplets, Battery, Thermometer, Leaf, Bug, Bot,
} from "lucide-react";

type Mode = "text" | "image" | "audio";
type Tab = "ask" | "recommendations" | "insights";

const MODE_STYLES: Record<Mode, { tab: string; btn: string }> = {
  text: { tab: "bg-primary text-white border-primary", btn: "bg-primary" },
  image: { tab: "bg-info text-white border-info", btn: "bg-info" },
  audio: { tab: "bg-warning text-white border-warning", btn: "bg-warning" },
};

const TABS: { key: Tab; label: string }[] = [
  { key: "ask", label: "Ask AI" },
  { key: "recommendations", label: "Recommendations" },
  { key: "insights", label: "Insights" },
];

type Tip = {
  icon: typeof Droplets;
  title: string;
  detail: string;
};

type Signal = {
  icon: React.ElementType;
  color: string;
  title: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "muted";
};

function AssistantPageInner() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "ask";
  const [tab, setTab] = useState<Tab>(
    TABS.some((t) => t.key === initialTab) ? initialTab : "ask"
  );

  // ---------- Ask AI state ----------
  const [mode, setMode] = useState<Mode>("text");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [textInput, setTextInput] = useState("");

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imgQuestion, setImgQuestion] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {}
      try {
        window.speechSynthesis?.cancel();
      } catch {}
    };
  }, []);

  function resetOutput() {
    setError(null);
    setAnswer(null);
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    setIsSpeaking(false);
  }

  async function callAssistant(payload: {
    text?: string;
    imageBase64?: string;
    imageMediaType?: string;
  }) {
    setLoading(true);
    resetOutput();
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      setAnswer(data.answer);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function runText() {
    if (!textInput.trim()) {
      setError("Type a question first.");
      return;
    }
    await callAssistant({ text: textInput.trim() });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageMediaType(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setImageBase64(result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  }

  async function runImage() {
    if (!imageBase64 || !imageMediaType) {
      setError("Upload a crop or field photo first.");
      return;
    }
    await callAssistant({
      text: imgQuestion.trim() || "What crop issue, if any, do you see in this image?",
      imageBase64,
      imageMediaType,
    });
  }

  function toggleMic() {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Speech recognition isn't supported in this browser — try Chrome.");
      return;
    }
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let final = "";
    recognition.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      setTranscript((final + interim).trim());
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    setTranscript("");
    recognition.start();
    setIsRecording(true);
  }

  async function runAudio() {
    if (!transcript.trim()) {
      setError("Record a question first.");
      return;
    }
    await callAssistant({ text: transcript.trim() });
  }

  function speakAnswer() {
    if (!("speechSynthesis" in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (!answer) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  }

  // ---------- Shared sensor/robot data (Recommendations + Insights) ----------
  const [latest, setLatest] = useState<SensorReading | null>(null);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    Promise.all([
      supabase
        .from("sensor_data")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SensorReading>(),
      supabase
        .from("robot_status")
        .select("*")
        .eq("robot_id", "agribot-01")
        .single<RobotStatus>(),
    ]).then(([{ data: latestRow }, { data: statusRow }]) => {
      if (cancelled) return;
      if (latestRow) setLatest(latestRow);
      if (statusRow) setStatus(statusRow);
      setDataLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Recommendations derived data ----------
  const tips: Tip[] = [];
  if (latest?.soil_moisture != null) {
    if (latest.soil_moisture < 35) {
      tips.push({
        icon: Droplets,
        title: "Irrigate soon",
        detail: `Soil moisture is ${latest.soil_moisture.toFixed(0)}% — below the optimal range for most crops.`,
      });
    } else if (latest.soil_moisture > 80) {
      tips.push({
        icon: Droplets,
        title: "Hold off on watering",
        detail: `Soil moisture is ${latest.soil_moisture.toFixed(0)}% — already well saturated.`,
      });
    }
  }
  if (latest?.temperature != null && latest.temperature > 32) {
    tips.push({
      icon: Thermometer,
      title: "Monitor for heat stress",
      detail: `Temperature is ${latest.temperature.toFixed(1)}°C — keep an eye on wilting.`,
    });
  }
  if (latest?.battery_percent != null && latest.battery_percent < 30) {
    tips.push({
      icon: Battery,
      title: "Schedule a recharge",
      detail: `Battery is at ${latest.battery_percent.toFixed(0)}% — plan the next charging cycle.`,
    });
  }
  if (dataLoaded && tips.length === 0) {
    tips.push({
      icon: Leaf,
      title: "Conditions look good",
      detail: "Readings are within normal range — no action needed right now.",
    });
  }

  const recChecks: { inRange: boolean }[] = [];
  if (latest?.soil_moisture != null) {
    recChecks.push({ inRange: latest.soil_moisture >= 35 && latest.soil_moisture <= 80 });
  }
  if (latest?.temperature != null) {
    recChecks.push({ inRange: latest.temperature <= 32 });
  }
  if (latest?.battery_percent != null) {
    recChecks.push({ inRange: latest.battery_percent >= 30 });
  }
  const healthScore =
    recChecks.length > 0
      ? Math.round((recChecks.filter((c) => c.inRange).length / recChecks.length) * 100)
      : null;

  // ---------- Insights derived data ----------
  const signals: Signal[] = [];
  if (latest?.soil_moisture != null) {
    if (latest.soil_moisture < 30) {
      signals.push({
        icon: Droplets, color: "#0ea5e9", tone: "danger",
        title: "Soil moisture is low",
        detail: `${latest.soil_moisture.toFixed(0)}% — irrigation recommended soon.`,
      });
    } else if (latest.soil_moisture > 85) {
      signals.push({
        icon: Droplets, color: "#0ea5e9", tone: "warning",
        title: "Soil is very saturated",
        detail: `${latest.soil_moisture.toFixed(0)}% — hold off on watering.`,
      });
    } else {
      signals.push({
        icon: Droplets, color: "#0ea5e9", tone: "success",
        title: "Soil moisture is healthy",
        detail: `${latest.soil_moisture.toFixed(0)}% — within the optimal range.`,
      });
    }
  }
  if (latest?.temperature != null) {
    if (latest.temperature > 32) {
      signals.push({
        icon: Thermometer, color: "#f97316", tone: "warning",
        title: "Elevated temperature",
        detail: `${latest.temperature.toFixed(1)}°C — watch for heat stress on crops.`,
      });
    } else {
      signals.push({
        icon: Thermometer, color: "#f97316", tone: "success",
        title: "Temperature is stable",
        detail: `${latest.temperature.toFixed(1)}°C — in a comfortable range.`,
      });
    }
  }
  if (latest?.battery_percent != null) {
    if (latest.battery_percent < 25) {
      signals.push({
        icon: Battery, color: "#ef4444", tone: "danger",
        title: "Robot battery is low",
        detail: `${latest.battery_percent.toFixed(0)}% — recharge before the next patrol.`,
      });
    } else {
      signals.push({
        icon: Battery, color: "#16a34a", tone: "success",
        title: "Robot is ready to patrol",
        detail: `Battery at ${latest.battery_percent.toFixed(0)}% — sufficient for normal operation.`,
      });
    }
  }
  const isStale = status?.updated_at && Date.now() - new Date(status.updated_at).getTime() > 30_000;
  const online = (status?.online ?? false) && !isStale;
  if (dataLoaded) {
    signals.push({
      icon: Bot, color: online ? "#16a34a" : "#6b7583", tone: online ? "success" : "muted",
      title: online ? "Robot is online" : "Robot is offline",
      detail: online
        ? `Mode: ${status?.mode === "auto" ? "Auto" : "Manual"} — reporting normally.`
        : "No recent heartbeat — check power and connectivity.",
    });
  }

  const insChecks: boolean[] = [];
  if (latest?.soil_moisture != null) insChecks.push(latest.soil_moisture >= 30 && latest.soil_moisture <= 85);
  if (latest?.temperature != null) insChecks.push(latest.temperature <= 32);
  if (latest?.battery_percent != null) insChecks.push(latest.battery_percent >= 25);
  if (status) insChecks.push(online);

  const score = insChecks.length
    ? Math.round((insChecks.filter(Boolean).length / insChecks.length) * 100)
    : null;
  const scoreLabel = score == null ? "No data yet" : score >= 80 ? "Good" : score >= 50 ? "Needs attention" : "At risk";

  const subtitleByTab: Record<Tab, string> = {
    ask: "Text, photo, or voice",
    recommendations: "AI image analysis + live sensor rules",
    insights: "Farm-wide summary, generated from live sensor data",
  };

  return (
    <DashboardShell title="AI" subtitle={subtitleByTab[tab]}>
      <>
        <div className="mb-4 flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center rounded-lg border py-2.5 text-xs font-medium transition ${
                tab === t.key
                  ? "bg-primary text-white border-primary"
                  : "border-border bg-surface text-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "ask" && (
          <>
            <div className="mb-4 flex gap-2">
              {(["text", "image", "audio"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    resetOutput();
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2.5 text-xs font-medium transition ${
                    mode === m
                      ? MODE_STYLES[m].tab
                      : "border-border bg-surface text-muted"
                  }`}
                >
                  {m === "text" && <Type className="h-3.5 w-3.5" />}
                  {m === "image" && <ImageIcon className="h-3.5 w-3.5" />}
                  {m === "audio" && <Mic className="h-3.5 w-3.5" />}
                  {m === "text" ? "Text" : m === "image" ? "Photo" : "Voice"}
                </button>
              ))}
            </div>

            {mode === "text" && (
              <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                  Ask about your crop, soil, or the robot
                </h3>
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="e.g. My tomato leaves are turning yellow at the edges — why?"
                  className="min-h-[90px] w-full resize-y rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                />
                <button
                  onClick={runText}
                  disabled={loading}
                  className={`mt-3 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-60 ${MODE_STYLES.text.btn}`}
                >
                  {loading ? "Thinking..." : "Ask →"}
                </button>
              </section>
            )}

            {mode === "image" && (
              <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                  Upload a crop or leaf photo
                </h3>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer rounded-lg border border-dashed border-border bg-white p-5 text-center text-sm text-muted transition hover:border-info"
                >
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt="Uploaded preview"
                      className="mx-auto max-h-40 rounded-lg"
                    />
                  ) : (
                    "Click to upload a photo (leaf, pest, soil...)"
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onFile}
                    className="hidden"
                  />
                </div>
                <input
                  type="text"
                  value={imgQuestion}
                  onChange={(e) => setImgQuestion(e.target.value)}
                  placeholder="What do you want to know? (default: identify any issue)"
                  className="mt-3 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none focus:border-info"
                />
                <button
                  onClick={runImage}
                  disabled={loading}
                  className={`mt-3 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-60 ${MODE_STYLES.image.btn}`}
                >
                  {loading ? "Analyzing..." : "Analyze →"}
                </button>
              </section>
            )}

            {mode === "audio" && (
              <section className="rounded-xl border border-border bg-surface p-4 shadow-sm text-center">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
                  Speak your question
                </h3>
                <button
                  onClick={toggleMic}
                  className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white transition ${
                    isRecording ? "animate-pulse bg-warning" : MODE_STYLES.audio.btn
                  }`}
                >
                  <Mic className="h-6 w-6" />
                </button>
                <p className="mt-3 min-h-[20px] text-sm text-muted">
                  {transcript || (isRecording ? "Listening..." : "Tap the mic and speak.")}
                </p>
                <button
                  onClick={runAudio}
                  disabled={loading || !transcript.trim()}
                  className={`mt-3 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-60 ${MODE_STYLES.audio.btn}`}
                >
                  {loading ? "Thinking..." : "Send transcript →"}
                </button>
              </section>
            )}

            <section className="mt-4 rounded-xl border border-border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Response
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              {!error && !answer && !loading && (
                <p className="text-sm text-muted">Waiting for a question...</p>
              )}
              {loading && <p className="text-sm text-muted">Thinking...</p>}
              {answer && (
                <>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {answer}
                  </p>
                  <button
                    onClick={speakAnswer}
                    className={`mt-3 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
                      isSpeaking
                        ? "border-danger/30 text-danger hover:bg-danger/5"
                        : "border-border text-muted hover:text-foreground"
                    }`}
                  >
                    {isSpeaking ? (
                      <VolumeX className="h-3.5 w-3.5" />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5" />
                    )}
                    {isSpeaking ? "Stop" : "Play spoken response"}
                  </button>
                </>
              )}
            </section>
          </>
        )}

        {tab === "recommendations" && (
          <>
            {healthScore != null && (
              <div className="mb-5 flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
                <ProgressRing
                  percent={healthScore}
                  color={healthScore >= 70 ? "#16a34a" : healthScore >= 40 ? "#f59e0b" : "#ef4444"}
                  size={72}
                  stroke={7}
                >
                  <span className="text-base font-bold text-foreground">{healthScore}</span>
                </ProgressRing>
                <div className="flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Farm Health Score
                  </span>
                  <p className="mt-0.5 text-xs text-muted">
                    Based on {recChecks.length} live metric{recChecks.length === 1 ? "" : "s"} currently in range
                  </p>
                </div>
                <StatusBadge
                  label={healthScore >= 70 ? "Good" : healthScore >= 40 ? "Fair" : "Needs attention"}
                  tone={healthScore >= 70 ? "success" : healthScore >= 40 ? "warning" : "danger"}
                />
              </div>
            )}

            <PlantAnalysis />

            <div className="mt-5">
              <SectionHeading eyebrow="Rule-Based" title="Sensor Recommendations" />
            </div>
            <div className="flex flex-col gap-3">
              {tips.map((tip) => (
                <div
                  key={tip.title}
                  className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <tip.icon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {tip.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{tip.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-4 text-center text-xs text-muted">
              Sensor rules trigger automatically from live readings — no AI call needed for these.
            </p>
          </>
        )}

        {tab === "insights" && (
          <>
            <section className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-primary to-emerald-600 p-5 text-white shadow-md">
              <ProgressRing percent={score ?? 0} color="#ffffff" size={76} stroke={7}>
                <span className="text-lg font-bold text-white">
                  {score != null ? score : "—"}
                </span>
              </ProgressRing>
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/80">
                  <Sparkles className="h-3.5 w-3.5" />
                  Farm Health Score
                </p>
                <p className="mt-1 text-base font-semibold">{scoreLabel}</p>
                <p className="mt-0.5 text-xs text-white/80">
                  {insChecks.length > 0
                    ? `Based on ${insChecks.length} live metric${insChecks.length > 1 ? "s" : ""} the robot is currently reporting.`
                    : "Waiting on sensor readings to calculate a score."}
                </p>
              </div>
            </section>

            <div className="mt-4">
              <SectionHeading eyebrow="Signals" title="What AI Is Watching" />
              <div className="flex flex-col gap-2.5">
                {signals.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-2xl border border-border bg-white p-3.5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
                  >
                    <IconTile icon={s.icon} color={s.color} size={32} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground dark:text-gray-100">{s.title}</p>
                        <StatusBadge
                          label={s.tone === "success" ? "OK" : s.tone === "warning" ? "Watch" : s.tone === "danger" ? "Action" : "—"}
                          tone={s.tone}
                        />
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted dark:text-gray-400">{s.detail}</p>
                    </div>
                  </div>
                ))}
                {signals.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted dark:border-gray-700 dark:text-gray-400">
                    No sensor data reported yet — insights will appear once the robot starts sending readings.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface p-4 text-center dark:border-gray-700 dark:bg-gray-900">
              <Bug className="mx-auto h-5 w-5 text-muted dark:text-gray-500" />
              <p className="mt-1.5 text-xs font-medium text-foreground dark:text-gray-100">
                Pest & disease detection coming soon
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted dark:text-gray-400">
                This card will show real AI plant-image analysis results once the ESP32-CAM feed is
                connected — see the Recommendations tab for image-based checks available today.
              </p>
            </div>
          </>
        )}
      </>
    </DashboardShell>
  );
}

export default function AssistantPage() {
  return (
    <Suspense fallback={null}>
      <AssistantPageInner />
    </Suspense>
  );
}
