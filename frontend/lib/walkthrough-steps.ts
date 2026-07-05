export type WalkthroughPlacement = "top" | "bottom" | "left" | "right" | "center";

export interface WalkthroughStep {
  path: string;
  selector: string | null;
  title: string;
  body: string;
  placement: WalkthroughPlacement;
}

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    path: "/dashboard",
    selector: null,
    title: "Here's the tour",
    body: "We'll walk through uploading a transcript, what AI pulls out of it, the calendar, and cross-meeting search. About 60 seconds.",
    placement: "center",
  },
  {
    path: "/dashboard",
    selector: '[data-tour="nav-meetings"]',
    title: "Your meetings",
    body: "This is home base. Every meeting you upload shows up here with a live processing status while AI works in the background.",
    placement: "right",
  },
  {
    path: "/dashboard",
    selector: '[data-tour="upload-button"]',
    title: "Upload a transcript",
    body: "Paste raw text or drop a file. Upload returns instantly — a worker extracts everything in the background, usually within 10–20 seconds.",
    placement: "left",
  },
  {
    path: "/dashboard",
    selector: '[data-tour="nav-calendar"]',
    title: "Calendar view",
    body: "Meetings, action deadlines, decisions, and gap risk levels — all plotted on a timeline, pulled straight from your transcripts.",
    placement: "right",
  },
  {
    path: "/dashboard",
    selector: '[data-tour="nav-ask-ai"]',
    title: "Ask AI, across everything",
    body: "Ask something like “what keeps getting deferred?” and it searches every processed meeting at once, not just one.",
    placement: "right",
  },
  {
    path: "/meetings/upload",
    selector: '[data-tour="upload-mode-toggle"]',
    title: "Paste or upload a file",
    body: "Paste a transcript directly, or drop a .vtt (Zoom/Meet/Teams captions), .txt (Otter, Rev), or .docx file. Speaker names improve action-item attribution.",
    placement: "bottom",
  },
  {
    path: "/meetings/upload",
    selector: '[data-tour="upload-tips"]',
    title: "What AI extracts",
    body: "Every transcript is scanned for decisions (with owner and confidence), action items (with assignee), and gaps — risks nobody flagged out loud.",
    placement: "left",
  },
  {
    path: "/meetings/upload",
    selector: null,
    title: "Inside a processed meeting",
    body: "Once processing finishes, open any meeting to see four tabs — Decisions, Actions, Gaps, and a meeting-scoped Ask tab for follow-up questions.",
    placement: "center",
  },
  {
    path: "/calendar",
    selector: '[data-tour="calendar-legend"]',
    title: "Everything, on a timeline",
    body: "Color-coded by type, with gap risk shown at a glance. Click any day to see what's on it, or drill into the full meeting.",
    placement: "left",
  },
  {
    path: "/query",
    selector: '[data-tour="query-textarea"]',
    title: "Cross-meeting Ask AI",
    body: "This searches all your processed meetings at once via vector search, and cites which meetings the answer came from.",
    placement: "bottom",
  },
  {
    path: "/query",
    selector: null,
    title: "You're ready",
    body: "Upload your first transcript to see it in action. Replay this tour anytime from the Help button in the sidebar.",
    placement: "center",
  },
];
