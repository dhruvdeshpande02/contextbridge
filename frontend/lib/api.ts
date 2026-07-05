import { auth } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = auth.getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface UserOut { id: string; email: string; }
export interface Token { access_token: string; token_type: string; }

export const register = (email: string, password: string) =>
  request<UserOut>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });

export const login = async (email: string, password: string): Promise<Token> => {
  const form = new URLSearchParams({ username: email, password });
  const res = await fetch(`${BASE}/auth/login`, { method: "POST", body: form });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? "Login failed"); }
  return res.json();
};

// ─── Meetings ────────────────────────────────────────────────────────────────

export type MeetingStatus = "pending" | "processing" | "completed" | "failed";

export interface Meeting {
  id: string;
  title: string;
  status: MeetingStatus;
  created_at: string;
}

export interface Decision { id: string; text: string; owner: string | null; confidence: number; }
export interface ActionItem { id: string; text: string; assignee: string | null; depends_on: string | null; due_date: string | null; }
export interface Gap { id: string; description: string; risk_level: "low" | "medium" | "high"; }

export type CalendarEventType = "meeting" | "action" | "decision" | "gap";
export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  date: string;
  meeting_id: string;
  meeting_title: string;
  meta: Record<string, unknown>;
}

export const uploadMeeting = (title: string, raw_transcript: string, meeting_date?: string) =>
  request<Meeting>("/meetings/upload", { method: "POST", body: JSON.stringify({ title, raw_transcript, meeting_date: meeting_date || null }) });

export const uploadMeetingFile = async (title: string, file: File, meeting_date?: string): Promise<Meeting> => {
  const token = auth.getToken();
  const form = new FormData();
  form.append("title", title);
  form.append("file", file);
  if (meeting_date) form.append("meeting_date", meeting_date);
  const res = await fetch(`${BASE}/meetings/upload-file`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Upload failed");
  }
  return res.json();
};

export const listMeetings = () => request<Meeting[]>("/meetings");

export const getMeeting = (id: string) => request<Meeting>(`/meetings/${id}`);

export const reprocessMeeting = (id: string) =>
  request<Meeting>(`/meetings/${id}/reprocess`, { method: "POST" });

export const getDecisions = (id: string) => request<Decision[]>(`/meetings/${id}/decisions`);
export const getActions = (id: string) => request<ActionItem[]>(`/meetings/${id}/actions`);
export const getGaps = (id: string) => request<Gap[]>(`/meetings/${id}/gaps`);

// ─── Streaming Q&A (Server-Sent Events over a POST body) ────────────────────
// The non-streaming POST /ask and /query REST endpoints still exist on the
// backend (documented in the README, covered by tests) — this client only
// talks to the streaming variants since that's what the UI uses.
// EventSource can't send a POST body or an Authorization header, so we read
// the response body as a stream and split it into SSE frames by hand.

export interface StreamEvent {
  type: "token" | "sources" | "done" | "error";
  text?: string;
  sources?: string[];
  message?: string;
}

async function* streamSSE(path: string, body: unknown): AsyncGenerator<StreamEvent> {
  const token = auth.getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const dataLine = frame.split("\n").find(l => l.startsWith("data: "));
      if (dataLine) yield JSON.parse(dataLine.slice("data: ".length)) as StreamEvent;
    }
  }
}

export const streamAskMeeting = (id: string, question: string) =>
  streamSSE(`/meetings/${id}/ask/stream`, { question });

export const streamQueryMeetings = (question: string) =>
  streamSSE("/meetings/query/stream", { question });

export const getCalendar = (start: string, end: string) =>
  request<{ events: CalendarEvent[] }>(`/meetings/calendar?start=${start}&end=${end}`);

export const reprocessDates = () =>
  request<{ queued: number }>("/meetings/reprocess-dates", { method: "POST" });

export const getUndatedActions = () =>
  request<ActionItem[]>("/meetings/undated-actions");
