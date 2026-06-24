"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadMeeting } from "@/lib/api";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function UploadPage() {
  const router = useRouter();
  useEffect(() => { if (!auth.isLoggedIn()) router.replace("/login"); }, [router]);

  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transcript.trim()) { setError("Transcript cannot be empty."); return; }
    setError(""); setLoading(true);
    try {
      const meeting = await uploadMeeting(title, transcript);
      router.push(`/meetings/${meeting.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-slate-100">Upload Meeting</h1>
        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Meeting Title</label>
              <Input placeholder="e.g. Sprint Planning — Week 24" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Transcript</label>
              <Textarea
                placeholder={"Alice: We decided to ship the onboarding flow by Friday.\nBob: I'll handle the backend changes…"}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={16}
                className="font-mono text-xs leading-relaxed"
                required
              />
              <p className="mt-1.5 text-xs text-muted">{transcript.split(/\s+/).filter(Boolean).length} words</p>
            </div>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
              <Button type="submit" loading={loading}>
                {loading ? "Uploading…" : "Upload & Analyse"}
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
