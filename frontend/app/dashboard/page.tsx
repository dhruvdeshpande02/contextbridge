"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listMeetings } from "@/lib/api";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const router = useRouter();
  useEffect(() => { if (!auth.isLoggedIn()) router.replace("/login"); }, [router]);

  const { data: meetings, isLoading } = useQuery({
    queryKey: ["meetings"],
    queryFn: listMeetings,
    refetchInterval: 5000,
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-4 pt-20 pb-24 md:ml-44 md:px-0 md:pl-16 md:pr-10 md:pt-10 md:pb-12">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink tracking-tight">Your Meetings</h1>
            <p className="mt-0.5 text-sm text-muted">
              {meetings != null
                ? `${meetings.length} meeting${meetings.length !== 1 ? "s" : ""} on record`
                : "Loading..."}
            </p>
          </div>
          <Link href="/meetings/upload" data-tour="upload-button">
            <Button>+ Upload</Button>
          </Link>
        </div>

        {/* Skeletons */}
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 rounded-xl shimmer" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && meetings?.length === 0 && (
          <div className="flex flex-col items-start py-16 animate-scale-in">
            <div className="mb-4 text-3xl" style={{ color: "#4f7ef8", opacity: 0.4 }}>&#128193;</div>
            <h2 className="text-base font-semibold text-ink mb-1">No meetings yet</h2>
            <p className="text-sm text-muted mb-6 max-w-sm">
              Upload a transcript and let the AI surface decisions, actions, and gaps automatically.
            </p>
            <Link href="/meetings/upload">
              <Button>Upload your first meeting</Button>
            </Link>
          </div>
        )}

        {/* Meeting rows */}
        <div className="space-y-2">
          {meetings?.map((m, i) => (
            <Link key={m.id} href={`/meetings/${m.id}`}>
              <div
                className="group flex items-center justify-between rounded-xl border px-4 py-3.5 cursor-pointer card-hover animate-slide-up"
                style={{
                  borderColor: "rgba(255,255,255,0.06)",
                  background: "rgba(22,27,39,0.6)",
                  animationDelay: `${i * 0.04}s`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-7 w-7 flex-shrink-0 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background: "rgba(79,126,248,0.1)", color: "#4f7ef8" }}
                  >
                    {m.title.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink leading-tight">{m.title}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {new Date(m.created_at).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={m.status} />
                  <span className="text-muted/0 text-xs group-hover:text-muted transition-colors">&#8594;</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Cross-meeting tip */}
        {!isLoading && meetings && meetings.length > 0 && (
          <div
            className="mt-8 rounded-xl border px-4 py-3 flex items-center gap-3 animate-slide-up"
            style={{
              borderColor: "rgba(79,126,248,0.15)",
              background: "rgba(79,126,248,0.04)",
              animationDelay: `${(meetings.length * 0.04) + 0.1}s`,
            }}
          >
            <span className="text-sm" style={{ color: "#4f7ef8" }}>&#10022;</span>
            <p className="text-sm text-muted">
              Try{" "}
              <Link href="/query" className="text-ink underline underline-offset-2 hover:text-subtle transition-colors">Ask AI</Link>
              {" "}&#8212; query across all your meetings at once.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
