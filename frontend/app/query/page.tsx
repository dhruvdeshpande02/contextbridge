"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { queryMeetings, type QueryResult } from "@/lib/api";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function QueryPage() {
  const router = useRouter();
  useEffect(() => { if (!auth.isLoggedIn()) router.replace("/login"); }, [router]);

  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setError(""); setResult(null); setLoading(true);
    try {
      const res = await queryMeetings(question);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-100">Cross-Meeting Query</h1>
          <p className="mt-1 text-sm text-muted">Ask a question across all your processed meetings.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            placeholder="e.g. What keeps getting deferred? Who hasn't been assigned tasks? What risks were raised?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            className="text-sm"
          />
          <div className="flex justify-end">
            <Button type="submit" loading={loading} disabled={!question.trim()}>
              {loading ? "Searching…" : "Ask"}
            </Button>
          </div>
        </form>

        {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

        {result && (
          <div className="mt-6 space-y-4">
            <Card>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Answer</p>
              <p className="text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">{result.answer}</p>
            </Card>
            {result.sources.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Source meetings</p>
                <div className="flex flex-wrap gap-2">
                  {result.sources.map((id) => (
                    <Link key={id} href={`/meetings/${id}`}>
                      <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-accent hover:border-accent transition-colors cursor-pointer font-mono">
                        {id.slice(0, 8)}…
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
