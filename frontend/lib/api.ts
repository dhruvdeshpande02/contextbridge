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
export interface ActionItem { id: string; text: string; assignee: string | null; depends_on: string | null; }
export interface Gap { id: string; description: string; risk_level: "low" | "medium" | "high"; }
export interface QueryResult { answer: string; sources: string[]; }
export interface AskResult { answer: string; }

export const uploadMeeting = (title: string, raw_transcript: string) =>
  request<Meeting>("/meetings/upload", { method: "POST", body: JSON.stringify({ title, raw_transcript }) });

export const uploadMeetingFile = async (title: string, file: File): Promise<Meeting> => {
  const token = auth.getToken();
  const form = new FormData();
  form.append("title", title);
  form.append("file", file);
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

export const getDecisions = (id: string) => request<Decision[]>(`/meetings/${id}/decisions`);
export const getActions = (id: string) => request<ActionItem[]>(`/meetings/${id}/actions`);
export const getGaps = (id: string) => request<Gap[]>(`/meetings/${id}/gaps`);

export const askMeeting = (id: string, question: string) =>
  request<AskResult>(`/meetings/${id}/ask`, { method: "POST", body: JSON.stringify({ question }) });

export const queryMeetings = (question: string) =>
  request<QueryResult>("/meetings/query", { method: "POST", body: JSON.stringify({ question }) });
