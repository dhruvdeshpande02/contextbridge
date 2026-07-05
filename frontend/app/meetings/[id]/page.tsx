"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  getMeeting, getDecisions, getActions, getGaps, streamAskMeeting, reprocessMeeting,
  type Decision, type ActionItem, type Gap,
} from "@/lib/api";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { StatusBadge } from "@/components/status-badge";
import { ConfidenceBar } from "@/components/confidence-bar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

const TABS = ["Decisions", "Actions", "Gaps", "Ask"] as const;
type Tab = typeof TABS[number];

const riskStyle = {
  low:    { text: "#34d399", border: "rgba(52,211,153,0.2)",  bg: "rgba(52,211,153,0.04)"  },
  medium: { text: "#fbbf24", border: "rgba(251,191,36,0.2)",  bg: "rgba(251,191,36,0.04)"  },
  high:   { text: "#f87171", border: "rgba(248,113,113,0.2)", bg: "rgba(248,113,113,0.04)" },
};

const ASK_EXAMPLES = [
  "What was the final decision on the timeline?",
  "Who is responsible for the next steps?",
  "What risks were left unresolved?",
  "Summarise this meeting in 3 bullet points.",
];

function AskTab({ meetingId }: { meetingId: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");

  const ask = async (q = question) => {
    if (!q.trim()) return;
    setQuestion(q);
    setAnswer("");
    setError("");
    setLoading(true);
    setStreaming(false);
    try {
      for await (const event of streamAskMeeting(meetingId, q)) {
        if (event.type === "token") {
          setLoading(false);
          setStreaming(true);
          setAnswer(prev => prev + event.text);
        } else if (event.type === "error") {
          setError(event.message ?? "Failed to get answer");
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to get answer");
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  return (
    <div className="animate-scale-in">
      {/* Example chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {ASK_EXAMPLES.map(q => (
          <button key={q}
            onClick={() => ask(q)}
            className="px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{
              border: question === q ? "1px solid rgba(79,126,248,0.4)" : "1px solid rgba(255,255,255,0.06)",
              background: question === q ? "rgba(79,126,248,0.08)" : "rgba(22,27,39,0.6)",
              color: question === q ? "#6b96fa" : "#5a6070",
            }}
          >{q}</button>
        ))}
      </div>

      {/* Input */}
      <div className="rounded-xl p-4 mb-4"
        style={{ background: "rgba(22,27,39,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <Textarea
          placeholder="Ask anything about this meeting..."
          value={question}
          onChange={e => setQuestion(e.target.value)}
          rows={3}
          className="text-sm mb-3 bg-transparent border-none focus:ring-0 resize-none text-ink placeholder:text-muted w-full"
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(); }}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Ctrl + Enter</span>
          <Button disabled={!question.trim() || loading} loading={loading} onClick={() => ask()}>
            {loading ? "Thinking..." : "Ask"}
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
        <div className="flex items-center gap-3 py-4">
          <div className="flex gap-1">
            {[0,1,2].map(i => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-[#4f7ef8] animate-pulse"
                style={{ animationDelay: `${i*0.15}s` }} />
            ))}
          </div>
          <p className="text-sm text-muted">Reading this meeting...</p>
        </div>
      )}

      {answer && (
        <div className="rounded-xl p-5 animate-slide-up"
          style={{ background: "rgba(22,27,39,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Answer</p>
          <p className="text-sm leading-relaxed text-ink whitespace-pre-wrap">
            {answer}
            {streaming && <span className="inline-block w-1.5 h-4 ml-0.5 align-middle animate-pulse" style={{ background: "#4f7ef8" }} />}
          </p>
        </div>
      )}
    </div>
  );
}

export default function MeetingDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("Decisions");
  const [retrying, setRetrying] = useState(false);

  useEffect(() => { if (!auth.isLoggedIn()) router.replace("/login"); }, [router]);

  const { data: meeting, refetch: refetchMeeting } = useQuery({
    queryKey: ["meeting", id],
    queryFn: () => getMeeting(id),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "completed" || s === "failed" ? false : 3000;
    },
  });

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await reprocessMeeting(id);
      await refetchMeeting();
    } finally {
      setRetrying(false);
    }
  };

  const isReady = meeting?.status === "completed";
  const { data: decisions } = useQuery({ queryKey: ["decisions", id], queryFn: () => getDecisions(id), enabled: isReady });
  const { data: actions }   = useQuery({ queryKey: ["actions",   id], queryFn: () => getActions(id),   enabled: isReady });
  const { data: gaps }      = useQuery({ queryKey: ["gaps",      id], queryFn: () => getGaps(id),      enabled: isReady });

  const counts: Partial<Record<Tab, number>> = {
    Decisions: decisions?.length,
    Actions:   actions?.length,
    Gaps:      gaps?.length,
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-4 pt-20 pb-24 md:ml-44 md:px-0 md:pl-16 md:pr-10 md:pt-10 md:pb-12">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ink tracking-tight">{meeting?.title ?? "Loading..."}</h1>
            {meeting && (
              <p className="mt-0.5 text-xs text-muted">
                {new Date(meeting.created_at).toLocaleDateString("en-US", {
                  month: "long", day: "numeric", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            )}
          </div>
          {meeting && <StatusBadge status={meeting.status} />}
        </div>

        {/* Processing */}
        {(meeting?.status === "pending" || meeting?.status === "processing") && (
          <div className="rounded-xl py-10 px-6 flex flex-col items-center text-center"
            style={{ background: "rgba(22,27,39,0.6)", border: "1px solid rgba(79,126,248,0.1)" }}>
            <div className="flex gap-1.5 mb-4">
              {[0,1,2].map(i => (
                <span key={i} className="h-2 w-2 rounded-full bg-[#4f7ef8] animate-pulse" style={{ animationDelay: `${i*0.15}s` }} />
              ))}
            </div>
            <p className="text-sm font-semibold text-ink mb-1">Analysing your meeting...</p>
            <p className="text-xs text-muted max-w-xs">
              Usually 10-20 seconds. AI is extracting decisions, actions, and gaps.
            </p>
          </div>
        )}

        {meeting?.status === "failed" && (
          <div className="rounded-xl p-8 flex flex-col items-center text-center gap-4"
            style={{ background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.15)" }}>
            <div>
              <p className="text-sm font-medium text-red-400 mb-1">Processing failed</p>
              <p className="text-xs text-muted">The AI pipeline encountered an error. You can try again below.</p>
            </div>
            <Button
              onClick={handleRetry}
              loading={retrying}
              disabled={retrying}
              style={{
                background: "rgba(248,113,113,0.12)",
                border: "1px solid rgba(248,113,113,0.3)",
                color: "#f87171",
              }}
            >
              {retrying ? "Retrying..." : "Try Again"}
            </Button>
          </div>
        )}

        {/* Tabs */}
        {isReady && (
          <div className="animate-scale-in">
            <div className="mb-6 inline-flex gap-1 p-1 rounded-lg overflow-x-auto max-w-full"
              style={{ background: "rgba(15,17,23,0.8)", border: "1px solid rgba(255,255,255,0.05)" }}>
              {TABS.map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-150 flex-shrink-0"
                  style={tab === t
                    ? { background: "#4f7ef8", color: "#fff" }
                    : { color: "#5a6070" }
                  }
                >
                  {t}
                  {counts[t] != null && (
                    <span className="ml-1.5 text-xs opacity-60">{counts[t]}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Decisions */}
            {tab === "Decisions" && (
              <div className="space-y-2">
                {decisions?.length === 0 && <p className="text-sm text-muted py-4">No decisions extracted.</p>}
                {decisions?.map((d: Decision, i) => (
                  <div key={d.id}
                    className="rounded-xl p-4 card-hover animate-slide-up"
                    style={{ background: "rgba(22,27,39,0.6)", border: "1px solid rgba(255,255,255,0.06)", animationDelay: `${i*0.04}s` }}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-xs flex-shrink-0" style={{ color: "#4f7ef8" }}>&#9670;</span>
                      <div className="flex-1">
                        <p className="text-sm text-ink leading-relaxed">{d.text}</p>
                        <div className="mt-2.5 flex items-center gap-4">
                          {d.owner && (
                            <span className="text-xs text-muted">Owner: <span className="text-subtle font-medium">{d.owner}</span></span>
                          )}
                          <div className="flex-1"><ConfidenceBar value={d.confidence} /></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            {tab === "Actions" && (
              <div className="space-y-2">
                {actions?.length === 0 && <p className="text-sm text-muted py-4">No action items extracted.</p>}
                {actions?.map((a: ActionItem, i) => (
                  <div key={a.id}
                    className="rounded-xl p-4 card-hover animate-slide-up"
                    style={{ background: "rgba(22,27,39,0.6)", border: "1px solid rgba(255,255,255,0.06)", animationDelay: `${i*0.04}s` }}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex-shrink-0 text-sm" style={{ color: "#6b96fa" }}>&#9675;</span>
                      <div className="flex-1">
                        <p className="text-sm text-ink leading-relaxed">{a.text}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {a.assignee && (
                            <span className="rounded-md px-2 py-0.5"
                              style={{ background: "rgba(79,126,248,0.08)", border: "1px solid rgba(79,126,248,0.15)", color: "#6b96fa" }}>
                              {a.assignee}
                            </span>
                          )}
                          {a.depends_on && (
                            <span className="rounded-md px-2 py-0.5"
                              style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", color: "#f87171" }}>
                              Blocked: {a.depends_on}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Gaps */}
            {tab === "Gaps" && (
              <div className="space-y-2">
                {gaps?.length === 0 && <p className="text-sm text-muted py-4">No gaps detected.</p>}
                {gaps?.map((g: Gap, i) => {
                  const s = riskStyle[g.risk_level];
                  return (
                    <div key={g.id}
                      className="rounded-xl p-4 flex items-start gap-4 animate-slide-up"
                      style={{ background: s.bg, border: `1px solid ${s.border}`, animationDelay: `${i*0.04}s` }}>
                      <span className="mt-0.5 text-xs font-bold uppercase tracking-widest flex-shrink-0" style={{ color: s.text }}>
                        {g.risk_level}
                      </span>
                      <p className="text-sm text-ink leading-relaxed">{g.description}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Ask */}
            {tab === "Ask" && <AskTab meetingId={id} />}
          </div>
        )}
      </main>
    </div>
  );
}
