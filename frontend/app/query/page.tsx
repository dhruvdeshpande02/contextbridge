"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { streamQueryMeetings } from "@/lib/api";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

const EXAMPLES = [
  "What keeps getting deferred?",
  "Who has the most open action items?",
  "What risks were raised but never resolved?",
  "What decisions were made about the roadmap?",
];

export default function QueryPage() {
  const router = useRouter();
  useEffect(() => { if (!auth.isLoggedIn()) router.replace("/login"); }, [router]);

  const [question,  setQuestion]  = useState("");
  const [answer,    setAnswer]    = useState("");
  const [sources,   setSources]   = useState<string[] | null>(null);
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [streaming, setStreaming] = useState(false);

  const run = async (q = question) => {
    if (!q.trim()) return;
    setError(""); setAnswer(""); setSources(null); setLoading(true); setStreaming(false);
    try {
      for await (const event of streamQueryMeetings(q)) {
        if (event.type === "sources") {
          setSources(event.sources ?? []);
        } else if (event.type === "token") {
          setLoading(false);
          setStreaming(true);
          setAnswer(prev => prev + event.text);
        } else if (event.type === "error") {
          setError(event.message ?? "Query failed");
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-4 pt-20 pb-24 md:ml-44 md:px-0 md:pl-16 md:pr-10 md:pt-10 md:pb-12">

        <div className="mb-8">
          <h1 className="text-xl font-semibold text-ink tracking-tight">Ask AI</h1>
          <p className="text-sm text-muted mt-0.5">Query across all your processed meetings.</p>
        </div>

        {/* Example chips */}
        <div className="mb-4 flex flex-wrap gap-2">
          {EXAMPLES.map(q => (
            <button key={q}
              onClick={() => { setQuestion(q); setAnswer(""); setSources(null); }}
              className="px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{
                border: question === q ? "1px solid rgba(79,126,248,0.4)" : "1px solid rgba(255,255,255,0.06)",
                background: question === q ? "rgba(79,126,248,0.08)" : "rgba(22,27,39,0.6)",
                color: question === q ? "#6b96fa" : "#5a6070",
              }}
            >{q}</button>
          ))}
        </div>

        {/* Search form */}
        <div className="rounded-xl p-4 mb-4" data-tour="query-textarea"
          style={{ background: "rgba(22,27,39,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Textarea
            placeholder="What would you like to know about your meetings?"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            rows={4}
            className="text-sm mb-4 bg-transparent border-none focus:ring-0 resize-none text-ink placeholder:text-muted w-full"
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Ctrl + Enter</span>
            <Button disabled={!question.trim() || loading} loading={loading} onClick={() => run()}>
              {loading ? "Searching…" : "Ask AI"}
            </Button>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-lg px-4 py-3 text-sm text-red-400"
            style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
            {error}
          </p>
        )}

        {loading && (
          <div className="flex items-center gap-3 py-6 animate-scale-in">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <span key={i} className="h-1.5 w-1.5 rounded-full bg-[#4f7ef8] animate-pulse"
                  style={{ animationDelay: `${i*0.15}s` }} />
              ))}
            </div>
            <p className="text-sm text-muted">Reading your meetings…</p>
          </div>
        )}

        {answer && (
          <div className="space-y-4 animate-slide-up">
            <div className="rounded-xl p-5"
              style={{ background: "rgba(22,27,39,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Answer</p>
              <p className="text-sm leading-relaxed text-ink whitespace-pre-wrap">
                {answer}
                {streaming && <span className="inline-block w-1.5 h-4 ml-0.5 align-middle animate-pulse" style={{ background: "#4f7ef8" }} />}
              </p>
            </div>
            {sources && sources.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Sources</p>
                <div className="flex flex-wrap gap-2">
                  {sources.map(id => (
                    <Link key={id} href={`/meetings/${id}`}>
                      <span className="rounded-lg px-3 py-1 text-xs font-mono cursor-pointer transition-all"
                        style={{ background: "rgba(79,126,248,0.06)", border: "1px solid rgba(79,126,248,0.15)", color: "#6b96fa" }}>
                        #{id.slice(0, 8)}
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

