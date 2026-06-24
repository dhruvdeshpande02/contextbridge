"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getMeeting, getDecisions, getActions, getGaps, type Decision, type ActionItem, type Gap } from "@/lib/api";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { StatusBadge } from "@/components/status-badge";
import { ConfidenceBar } from "@/components/confidence-bar";
import { Card } from "@/components/ui/card";

const TABS = ["Decisions", "Actions", "Gaps"] as const;
type Tab = typeof TABS[number];

const riskColor = { low: "text-emerald-400", medium: "text-amber-400", high: "text-rose-400" };

export default function MeetingDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("Decisions");

  useEffect(() => { if (!auth.isLoggedIn()) router.replace("/login"); }, [router]);

  const { data: meeting } = useQuery({
    queryKey: ["meeting", id],
    queryFn: () => getMeeting(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 3000;
    },
  });

  const isReady = meeting?.status === "completed";

  const { data: decisions } = useQuery({ queryKey: ["decisions", id], queryFn: () => getDecisions(id), enabled: isReady });
  const { data: actions } = useQuery({ queryKey: ["actions", id], queryFn: () => getActions(id), enabled: isReady });
  const { data: gaps } = useQuery({ queryKey: ["gaps", id], queryFn: () => getGaps(id), enabled: isReady });

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{meeting?.title ?? "Loading…"}</h1>
            {meeting && (
              <p className="mt-1 text-xs text-muted">
                {new Date(meeting.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>
          {meeting && <StatusBadge status={meeting.status} />}
        </div>

        {(meeting?.status === "pending" || meeting?.status === "processing") && (
          <Card className="flex items-center gap-3 py-8 justify-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <span className="text-sm text-muted">Analysing transcript with AI… this takes a few seconds.</span>
          </Card>
        )}

        {meeting?.status === "failed" && (
          <Card className="text-center py-8">
            <p className="text-rose-400 text-sm">Processing failed. Please try uploading again.</p>
          </Card>
        )}

        {isReady && (
          <>
            <div className="mb-5 flex gap-1 border-b border-border">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-slate-300"
                  }`}
                >
                  {t}
                  <span className="ml-1.5 text-xs opacity-60">
                    {t === "Decisions" ? decisions?.length : t === "Actions" ? actions?.length : gaps?.length}
                  </span>
                </button>
              ))}
            </div>

            {tab === "Decisions" && (
              <div className="space-y-3">
                {decisions?.length === 0 && <p className="text-sm text-muted">No decisions extracted.</p>}
                {decisions?.map((d: Decision) => (
                  <Card key={d.id}>
                    <p className="text-sm text-slate-100">{d.text}</p>
                    <div className="mt-3 flex items-center gap-4">
                      {d.owner && <span className="text-xs text-muted">Owner: <span className="text-slate-300">{d.owner}</span></span>}
                      <div className="flex-1"><ConfidenceBar value={d.confidence} /></div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {tab === "Actions" && (
              <div className="space-y-3">
                {actions?.length === 0 && <p className="text-sm text-muted">No action items extracted.</p>}
                {actions?.map((a: ActionItem) => (
                  <Card key={a.id}>
                    <p className="text-sm text-slate-100">{a.text}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
                      {a.assignee && <span>Assignee: <span className="text-slate-300">{a.assignee}</span></span>}
                      {a.depends_on && <span>Blocked by: <span className="text-amber-300">{a.depends_on}</span></span>}
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {tab === "Gaps" && (
              <div className="space-y-3">
                {gaps?.length === 0 && <p className="text-sm text-muted">No gaps detected.</p>}
                {gaps?.map((g: Gap) => (
                  <Card key={g.id} className="flex items-start gap-4">
                    <span className={`mt-0.5 text-xs font-semibold uppercase ${riskColor[g.risk_level]}`}>{g.risk_level}</span>
                    <p className="text-sm text-slate-100">{g.description}</p>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
