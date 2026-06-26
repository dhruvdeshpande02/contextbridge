"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadMeeting, uploadMeetingFile } from "@/lib/api";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

const TIPS = [
  { icon: "◆", title: "Decisions", body: "Explicit choices made — \"We decided to ship by Friday.\"" },
  { icon: "○", title: "Action items", body: "Tasks with assignees — \"Alice will handle the API changes.\"" },
  { icon: "△", title: "Gaps", body: "Unresolved risks the AI detects even when speakers don't flag them." },
];

const ACCEPTED = ".vtt,.txt,.docx";
const FORMAT_LABELS: Record<string, { label: string; hint: string }> = {
  vtt:  { label: "WebVTT",      hint: "Zoom, Google Meet, Teams auto-captions" },
  txt:  { label: "Plain text",  hint: "Otter.ai, Rev.com, any manual transcript" },
  docx: { label: "Word doc",    hint: "Rev.com exports, hand-written meeting minutes" },
};

function FileDropZone({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className="flex flex-col items-center justify-center gap-3 rounded-xl cursor-pointer transition-all py-14"
      style={{
        border: dragging ? "1.5px dashed rgba(79,126,248,0.6)" : "1.5px dashed rgba(255,255,255,0.1)",
        background: dragging ? "rgba(79,126,248,0.05)" : "rgba(15,17,23,0.4)",
      }}
    >
      <div className="text-2xl" style={{ color: "#4f7ef8", opacity: 0.6 }}>&#8679;</div>
      <p className="text-sm text-muted text-center">
        Drag a file here or <span style={{ color: "#6b96fa" }}>browse</span>
      </p>
      <div className="flex gap-2">
        {[".vtt", ".txt", ".docx"].map(ext => (
          <span key={ext} className="rounded-md px-2 py-0.5 text-xs font-mono"
            style={{ background: "rgba(79,126,248,0.08)", border: "1px solid rgba(79,126,248,0.15)", color: "#6b96fa" }}>
            {ext}
          </span>
        ))}
      </div>
      <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}

function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const meta = FORMAT_LABELS[ext];
  const kb = (file.size / 1024).toFixed(1);
  return (
    <div className="flex items-center justify-between rounded-xl px-4 py-3"
      style={{ background: "rgba(79,126,248,0.06)", border: "1px solid rgba(79,126,248,0.15)" }}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-lg flex-shrink-0" style={{ color: "#4f7ef8" }}>&#128196;</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">{file.name}</p>
          <p className="text-xs text-muted">{meta?.label ?? ext.toUpperCase()} &mdash; {kb} KB &mdash; {meta?.hint}</p>
        </div>
      </div>
      <button onClick={onRemove} className="ml-4 flex-shrink-0 text-xs text-muted hover:text-ink transition-colors px-2 py-1">
        Remove
      </button>
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  useEffect(() => { if (!auth.isLoggedIn()) router.replace("/login"); }, [router]);

  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const wordCount = transcript.split(/\s+/).filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "paste" && !transcript.trim()) { setError("Transcript cannot be empty."); return; }
    if (mode === "file" && !file) { setError("Please select a file."); return; }

    setLoading(true);
    try {
      const meeting = mode === "paste"
        ? await uploadMeeting(title, transcript)
        : await uploadMeetingFile(title, file!);
      router.push(`/meetings/${meeting.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-44 flex-1 pl-16 pr-10 pt-10 pb-12">

        <div className="mb-7">
          <h1 className="text-xl font-semibold text-ink tracking-tight">Upload Meeting</h1>
          <p className="mt-0.5 text-sm text-muted">AI extracts decisions, actions, and gaps automatically.</p>
        </div>

        <div className="flex gap-8 items-start">

          {/* Left: form */}
          <div className="flex-1 min-w-0 rounded-xl p-6"
            style={{ background: "rgba(22,27,39,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Title */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted uppercase tracking-wider">Title</label>
                <Input
                  placeholder="e.g. Q3 Sprint Planning — Week 24"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                />
              </div>

              {/* Mode toggle */}
              <div>
                <div className="mb-3 inline-flex gap-1 p-1 rounded-lg"
                  style={{ background: "rgba(15,17,23,0.8)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  {(["paste", "file"] as const).map(m => (
                    <button key={m} type="button" onClick={() => { setMode(m); setError(""); }}
                      className="px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-150"
                      style={mode === m ? { background: "#4f7ef8", color: "#fff" } : { color: "#5a6070" }}>
                      {m === "paste" ? "Paste text" : "Upload file"}
                    </button>
                  ))}
                </div>

                {/* Paste mode */}
                {mode === "paste" && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted uppercase tracking-wider">Transcript</label>
                      <span className={`text-xs tabular-nums ${wordCount > 50 ? "text-[#6b96fa]" : "text-muted"}`}>
                        {wordCount} words
                      </span>
                    </div>
                    <Textarea
                      placeholder={"Alice: We decided to ship the onboarding flow by Friday.\nBob: I'll handle the backend changes.\nAlice: We still haven't resolved the API rate limiting issue…"}
                      value={transcript}
                      onChange={e => setTranscript(e.target.value)}
                      rows={16}
                      className="font-mono text-xs leading-relaxed"
                    />
                    <p className="mt-1 text-xs text-muted">Tip: include speaker names for better action item attribution.</p>
                  </div>
                )}

                {/* File mode */}
                {mode === "file" && (
                  <div className="space-y-3">
                    {!file
                      ? <FileDropZone onFile={setFile} />
                      : <FilePreview file={file} onRemove={() => setFile(null)} />
                    }
                    <p className="text-xs text-muted">
                      Timestamps are stripped from .vtt files automatically. Speaker names are preserved.
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <p className="rounded-lg px-3 py-2.5 text-xs text-red-400"
                  style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
                <Button type="submit" loading={loading}>
                  {loading ? "Uploading..." : "Upload & Analyse"}
                </Button>
              </div>
            </form>
          </div>

          {/* Right: info panel */}
          <div className="w-64 flex-shrink-0 flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">What AI extracts</p>

            {TIPS.map(t => (
              <div key={t.title} className="rounded-xl p-4"
                style={{ background: "rgba(22,27,39,0.5)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs" style={{ color: "#4f7ef8" }}>{t.icon}</span>
                  <span className="text-xs font-semibold text-ink">{t.title}</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">{t.body}</p>
              </div>
            ))}

            <div className="rounded-xl p-4"
              style={{ background: "rgba(22,27,39,0.5)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-xs font-semibold text-ink mb-2">Supported formats</p>
              {Object.entries(FORMAT_LABELS).map(([ext, { label, hint }]) => (
                <div key={ext} className="mb-2 last:mb-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-mono text-xs rounded px-1" style={{ background: "rgba(79,126,248,0.1)", color: "#6b96fa" }}>.{ext}</span>
                    <span className="text-xs font-medium text-ink">{label}</span>
                  </div>
                  <p className="text-xs text-muted pl-1">{hint}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-4"
              style={{ background: "rgba(79,126,248,0.05)", border: "1px solid rgba(79,126,248,0.12)" }}>
              <p className="text-xs font-semibold text-[#6b96fa] mb-1">Processing time</p>
              <p className="text-xs text-muted leading-relaxed">Usually 10–20 seconds. You'll be redirected automatically.</p>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
