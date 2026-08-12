"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Sparkles, Type, Image as ImageIcon, Mic, Volume2, VolumeX } from "lucide-react";

type Mode = "text" | "image" | "audio";

const MODE_STYLES: Record<Mode, { tab: string; btn: string }> = {
  text: { tab: "bg-primary text-white border-primary", btn: "bg-primary" },
  image: { tab: "bg-info text-white border-info", btn: "bg-info" },
  audio: { tab: "bg-warning text-white border-warning", btn: "bg-warning" },
};

export default function AssistantPage() {
  const [mode, setMode] = useState<Mode>("text");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // text
  const [textInput, setTextInput] = useState("");

  // image
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imgQuestion, setImgQuestion] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // audio
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

  return (
    <DashboardShell title="Ask AI" subtitle="Text, photo, or voice">
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
    </DashboardShell>
  );
}
