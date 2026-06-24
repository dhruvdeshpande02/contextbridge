"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listMeetings } from "@/lib/api";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function DashboardPage() {
  const router = useRouter();
  useEffect(() => { if (!auth.isLoggedIn()) router.replace("/login"); }, [router]);

  const { data: meetings, isLoading, error } = useQuery({
    queryKey: ["meetings"],
    queryFn: listMeetings,
    refetchInterval: 5000,
  });

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Meetings</h1>
            <p className="mt-0.5 text-sm text-muted">{meetings?.length ?? 0} total</p>
          </div>
          <Link href="/meetings/upload">
            <Button>+ Upload Meeting</Button>
          </Link>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            Loading meetings…
          </div>
        )}

        {error && <p className="text-sm text-rose-400">Failed to load meetings.</p>}

        {meetings?.length === 0 && (
          <Card className="text-center py-16">
            <p className="text-muted text-sm">No meetings yet.</p>
            <Link href="/meetings/upload">
              <Button className="mt-4">Upload your first meeting</Button>
            </Link>
          </Card>
        )}

        <div className="space-y-3">
          {meetings?.map((m) => (
            <Link key={m.id} href={`/meetings/${m.id}`}>
              <Card className="flex items-center justify-between hover:border-accent/50 transition-colors cursor-pointer">
                <div>
                  <p className="font-medium text-slate-100">{m.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <StatusBadge status={m.status} />
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
