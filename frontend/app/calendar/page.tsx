"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getCalendar, getUndatedActions, reprocessDates, type CalendarEvent, type CalendarEventType, type ActionItem } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";

// ── Colours ────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<CalendarEventType, string> = {
  meeting:  "#4f7ef8",
  action:   "#818cf8",
  decision: "#2dd4bf",
  gap:      "#f87171",
};

const TYPE_LABEL: Record<CalendarEventType, string> = {
  meeting:  "Meeting",
  action:   "Action",
  decision: "Decision",
  gap:      "Gap",
};

function gapColor(risk: string) {
  if (risk === "high")   return "#f87171";
  if (risk === "medium") return "#fbbf24";
  return "#34d399";
}

function eventColor(ev: CalendarEvent) {
  if (ev.type === "gap") return gapColor(ev.meta.risk_level as string);
  return TYPE_COLOR[ev.type];
}

// ── Date helpers ───────────────────────────────────────────────────────────

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Mon=0 … Sun=6
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ── Skeleton cell ──────────────────────────────────────────────────────────

function SkeletonCell({ col }: { col: number }) {
  return (
    <div
      className="min-h-[88px] p-1.5"
      style={{ borderRight: col < 6 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
    >
      <div className="h-2.5 w-4 rounded mb-2 ml-auto shimmer" />
      {col % 3 === 0 && <div className="h-4 rounded mb-0.5 shimmer" style={{ width: "90%" }} />}
      {col % 5 === 0 && <div className="h-4 rounded shimmer" style={{ width: "70%" }} />}
    </div>
  );
}

// ── Event chip ─────────────────────────────────────────────────────────────

function Chip({ ev, onSelect }: { ev: CalendarEvent; onSelect: () => void }) {
  const color = eventColor(ev);
  return (
    <button
      onClick={e => { e.stopPropagation(); onSelect(); }}
      className="w-full text-left truncate rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight mb-0.5 transition-opacity hover:opacity-80"
      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
      title={ev.title}
    >
      {ev.title}
    </button>
  );
}

// ── Day detail panel ───────────────────────────────────────────────────────

function DayPanel({ date, events, onClose }: { date: string; events: CalendarEvent[]; onClose: () => void }) {
  const label = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  return (
    <div className="mt-4 rounded-xl p-5 animate-slide-up"
      style={{ background: "rgba(22,27,39,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <button onClick={onClose} className="text-xs text-muted hover:text-ink transition-colors">Close</button>
      </div>
      <div className="flex flex-col gap-3">
        {events.map(ev => {
          const color = eventColor(ev);
          return (
            <Link key={ev.id} href={`/meetings/${ev.meeting_id}`}>
              <div className="flex gap-3 items-start p-3 rounded-lg cursor-pointer transition-all hover:opacity-90"
                style={{ background: `${color}0d`, border: `1px solid ${color}25` }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>
                      {TYPE_LABEL[ev.type]}
                    </span>
                    <span className="text-[10px] text-muted truncate">{ev.meeting_title}</span>
                  </div>
                  <p className="text-xs text-ink leading-snug">{ev.title}</p>
                  {ev.type === "action" && ev.meta.assignee && (
                    <p className="text-[10px] text-muted mt-0.5">Assignee: {ev.meta.assignee as string}</p>
                  )}
                  {ev.type === "gap" && (
                    <p className="text-[10px] mt-0.5" style={{ color }}>
                      Risk: {(ev.meta.risk_level as string).toUpperCase()}
                    </p>
                  )}
                  {ev.type === "decision" && ev.meta.owner && (
                    <p className="text-[10px] text-muted mt-0.5">Owner: {ev.meta.owner as string}</p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Undated actions panel ──────────────────────────────────────────────────

function UndatedPanel({ actions }: { actions: ActionItem[] }) {
  const [open, setOpen] = useState(false);
  if (actions.length === 0) return null;
  return (
    <div className="mt-6 rounded-xl overflow-hidden"
      style={{ border: "1px solid rgba(129,140,248,0.18)", background: "rgba(129,140,248,0.04)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: "#818cf8" }} />
          <span className="text-sm font-medium text-ink">Undated action items</span>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
            style={{ background: "rgba(129,140,248,0.15)", color: "#818cf8" }}>
            {actions.length}
          </span>
        </div>
        <span className="text-muted text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="px-5 pb-4 flex flex-col gap-2 animate-slide-up">
          <p className="text-[10px] text-muted mb-1">
            These action items have no extracted deadline. Add a date to the transcript or set the meeting date on upload.
          </p>
          {actions.map(a => (
            <Link key={a.id} href={`/meetings/${a.id}`}>
              <div className="flex gap-3 items-start p-3 rounded-lg cursor-pointer transition-all hover:opacity-90"
                style={{ background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.15)" }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: "#818cf8" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink leading-snug">{a.text}</p>
                  {a.assignee && (
                    <span className="text-[10px] text-muted">Assignee: {a.assignee}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState({ onReprocess, reprocessing }: { onReprocess: () => void; reprocessing: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-scale-in">
      <div className="mb-4 text-4xl opacity-20">&#128197;</div>
      <p className="text-sm font-medium text-ink mb-1">No events this month</p>
      <p className="text-xs text-muted mb-6 max-w-xs leading-relaxed">
        Upload a meeting with dates in the transcript, or set the meeting date manually on upload.
      </p>
      <div className="flex flex-col items-center gap-3">
        <Link href="/meetings/upload">
          <button className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: "#4f7ef8" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#3b6ef0")}
            onMouseLeave={e => (e.currentTarget.style.background = "#4f7ef8")}>
            Upload a meeting
          </button>
        </Link>
        <button
          onClick={onReprocess}
          disabled={reprocessing}
          className="text-xs text-muted hover:text-subtle transition-colors disabled:opacity-50"
        >
          {reprocessing ? "Re-queuing…" : "Re-extract dates from existing meetings"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const router = useRouter();
  useEffect(() => { if (!auth.isLoggedIn()) router.replace("/login"); }, [router]);

  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessMsg, setReprocessMsg] = useState("");

  // Fetch events for the visible month + one extra month either side for dot indicators
  const [dotMonths, setDotMonths] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    setSelectedDay(null);
    const start = isoDate(new Date(year, month, 1));
    const end   = isoDate(new Date(year, month + 1, 0));
    getCalendar(start, end)
      .then(r => setEvents(r.events))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [year, month]);

  // Fetch a 12-month window once to power dot indicators on nav buttons
  useEffect(() => {
    const start = isoDate(new Date(today.getFullYear(), today.getMonth() - 3, 1));
    const end   = isoDate(new Date(today.getFullYear(), today.getMonth() + 9, 0));
    getCalendar(start, end).then(r => {
      const months: Record<string, boolean> = {};
      for (const ev of r.events) {
        const key = ev.date.slice(0, 7); // "YYYY-MM"
        months[key] = true;
      }
      setDotMonths(months);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      (map[ev.date] ??= []).push(ev);
    }
    return map;
  }, [events]);

  const [undatedActions, setUndatedActions] = useState<ActionItem[]>([]);
  useEffect(() => {
    getUndatedActions().then(setUndatedActions).catch(() => {});
  }, []);

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  const prevKey = `${month === 0 ? year - 1 : year}-${String(month === 0 ? 12 : month).padStart(2, "0")}`;
  const nextKey = `${month === 11 ? year + 1 : year}-${String(month === 11 ? 1 : month + 2).padStart(2, "0")}`;

  const firstDay  = firstDayOfWeek(year, month);
  const totalDays = daysInMonth(year, month);
  const rows      = Math.ceil((firstDay + totalDays) / 7);

  const selectedEvents = selectedDay ? (eventsByDay[selectedDay] ?? []) : [];

  const typeCounts = useMemo(() => {
    const c: Record<CalendarEventType, number> = { meeting: 0, action: 0, decision: 0, gap: 0 };
    for (const ev of events) c[ev.type]++;
    return c;
  }, [events]);

  const handleReprocess = async () => {
    setReprocessing(true);
    setReprocessMsg("");
    try {
      const r = await reprocessDates();
      setReprocessMsg(r.queued === 0
        ? "All meetings already have dates extracted."
        : `Re-queued ${r.queued} meeting${r.queued === 1 ? "" : "s"}. Refresh in ~30s.`
      );
    } catch {
      setReprocessMsg("Failed to queue — check that the worker is running.");
    } finally {
      setReprocessing(false);
    }
  };

  const todayStr = isoDate(today);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-44 flex-1 pl-16 pr-10 pt-10 pb-12">

        {/* Header */}
        <div className="mb-7 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink tracking-tight">Calendar</h1>
            <p className="text-sm text-muted mt-0.5">Meetings, deadlines, decisions, and gaps — at a glance.</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleReprocess}
              disabled={reprocessing}
              className="text-xs text-muted hover:text-subtle transition-colors disabled:opacity-50"
            >
              {reprocessing ? "Re-queuing…" : "Re-extract dates from existing meetings"}
            </button>
            {reprocessMsg && (
              <p className="text-[10px] text-muted max-w-xs text-right">{reprocessMsg}</p>
            )}
          </div>
        </div>

        <div className="flex gap-8 items-start">

          {/* ── Calendar panel ── */}
          <div className="flex-1 min-w-0">

            {/* Month nav with dot indicators */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-sm text-muted hover:text-ink transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(22,27,39,0.5)" }}>
                <span>&#8592;</span>
                {dotMonths[prevKey] && (
                  <span className="w-1 h-1 rounded-full" style={{ background: "#4f7ef8" }} />
                )}
              </button>

              <h2 className="text-base font-semibold text-ink">{MONTHS[month]} {year}</h2>

              <button onClick={nextMonth}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-sm text-muted hover:text-ink transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(22,27,39,0.5)" }}>
                <span>&#8594;</span>
                {dotMonths[nextKey] && (
                  <span className="w-1 h-1 rounded-full" style={{ background: "#4f7ef8" }} />
                )}
              </button>
            </div>

            {/* Grid */}
            <div className="rounded-xl overflow-hidden"
              style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(15,17,23,0.5)" }}>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                {DAYS.map(d => (
                  <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells — skeleton while loading */}
              {Array.from({ length: rows }).map((_, row) => (
                <div key={row} className="grid grid-cols-7"
                  style={{ borderBottom: row < rows - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  {Array.from({ length: 7 }).map((_, col) => {
                    const cellIdx = row * 7 + col;
                    const dayNum  = cellIdx - firstDay + 1;
                    const isValid = dayNum >= 1 && dayNum <= totalDays;

                    if (loading && isValid) return <SkeletonCell key={col} col={col} />;

                    const dayStr    = isValid ? `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}` : "";
                    const dayEvs    = dayStr ? (eventsByDay[dayStr] ?? []) : [];
                    const isToday   = dayStr === todayStr;
                    const isSelected = dayStr === selectedDay;
                    const overflow  = dayEvs.length - 3;

                    return (
                      <div
                        key={col}
                        onClick={() => isValid && setSelectedDay(isSelected ? null : dayStr)}
                        className="min-h-[88px] p-1.5 transition-colors"
                        style={{
                          borderRight: col < 6 ? "1px solid rgba(255,255,255,0.04)" : "none",
                          background: isSelected
                            ? "rgba(79,126,248,0.07)"
                            : isValid ? "transparent" : "rgba(0,0,0,0.1)",
                          cursor: isValid ? "pointer" : "default",
                        }}
                      >
                        {isValid && (
                          <>
                            <p className="text-[11px] mb-1 text-right"
                              style={{
                                color: isToday ? "#4f7ef8" : isSelected ? "#6b96fa" : "#5a6070",
                                fontWeight: isToday ? 700 : 500,
                              }}>
                              {isToday
                                ? <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px]"
                                    style={{ background: "#4f7ef8" }}>{dayNum}</span>
                                : dayNum}
                            </p>
                            {dayEvs.slice(0, 3).map(ev => (
                              <Chip key={ev.id} ev={ev} onSelect={() => setSelectedDay(dayStr)} />
                            ))}
                            {overflow > 0 && (
                              <button
                                onClick={e => { e.stopPropagation(); setSelectedDay(dayStr); }}
                                className="text-[9px] text-muted hover:text-subtle pl-1 transition-colors"
                              >
                                +{overflow} more
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Empty state — shown after load when no events */}
            {!loading && events.length === 0 && (
              <EmptyState onReprocess={handleReprocess} reprocessing={reprocessing} />
            )}

            {/* Selected day detail */}
            {selectedDay && selectedEvents.length > 0 && (
              <DayPanel
                date={selectedDay}
                events={selectedEvents}
                onClose={() => setSelectedDay(null)}
              />
            )}

            {/* Undated actions panel */}
            <UndatedPanel actions={undatedActions} />
          </div>

          {/* ── Right sidebar ── */}
          <div className="w-52 flex-shrink-0 flex flex-col gap-4">

            {/* Legend */}
            <div className="rounded-xl p-4"
              style={{ background: "rgba(22,27,39,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Legend</p>
              {(Object.entries(TYPE_COLOR) as [CalendarEventType, string][]).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2 mb-2 last:mb-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-xs text-subtle capitalize">{TYPE_LABEL[type]}</span>
                </div>
              ))}
              <div className="mt-2 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <p className="text-[10px] text-muted mb-1.5">Gap risk levels</p>
                {[["high","#f87171"],["medium","#fbbf24"],["low","#34d399"]].map(([label, color]) => (
                  <div key={label} className="flex items-center gap-2 mb-1 last:mb-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-xs text-subtle capitalize">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Month summary */}
            <div className="rounded-xl p-4"
              style={{ background: "rgba(22,27,39,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">This month</p>
              {loading ? (
                <div className="space-y-2">
                  {[60, 45, 70, 50].map((w, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <div className="h-2.5 rounded shimmer" style={{ width: `${w}%` }} />
                      <div className="h-2.5 w-4 rounded shimmer" />
                    </div>
                  ))}
                </div>
              ) : events.length === 0 ? (
                <p className="text-xs text-muted">No events yet.</p>
              ) : (
                <div className="space-y-2">
                  {(Object.entries(typeCounts) as [CalendarEventType, number][])
                    .filter(([, n]) => n > 0)
                    .map(([type, n]) => (
                      <div key={type} className="flex items-center justify-between">
                        <span className="text-xs text-subtle capitalize">{TYPE_LABEL[type]}s</span>
                        <span className="text-xs font-semibold tabular-nums" style={{ color: TYPE_COLOR[type] }}>{n}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="rounded-xl p-4"
              style={{ background: "rgba(79,126,248,0.05)", border: "1px solid rgba(79,126,248,0.12)" }}>
              <p className="text-xs font-semibold text-[#6b96fa] mb-1">Tip</p>
              <p className="text-xs text-muted leading-relaxed">
                Action deadlines appear when the transcript mentions an explicit date, or when you set the meeting date on upload.
              </p>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
