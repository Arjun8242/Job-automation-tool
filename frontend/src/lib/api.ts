/**
 * Thin HTTP client that talks to the FastAPI backend.
 * Base URL is read from NEXT_PUBLIC_API_URL (defaults to http://localhost:8000).
 */

import type {
  EmailTemplate,
  JDExtractionRequest,
  JDExtractionResult,
  EmailGenerationRequest,
  GeneratedEmail,
  DraftCreationRequest,
  DraftCreationResult,
  GmailStatus,
} from "@/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API ${res.status}: ${detail}`);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ─── Templates ───────────────────────────────────────────

export const templatesApi = {
  list: () => request<EmailTemplate[]>("/api/outreach/templates"),
};

// ─── Resumes ─────────────────────────────────────────────

export const resumesApi = {
  list: () => request<string[]>("/api/resumes/"),
};

// ─── Outreach ─────────────────────────────────────────────

export const outreachApi = {
  extractJD: (req: JDExtractionRequest) =>
    request<JDExtractionResult>("/api/outreach/extract-jd", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  generateEmail: (req: EmailGenerationRequest) =>
    request<GeneratedEmail>("/api/outreach/generate", {
      method: "POST",
      body: JSON.stringify(req),
    }),
};

// ─── Gmail ───────────────────────────────────────────────

export interface GmailAuthResponse {
  status: "already_connected" | "in_progress" | "flow_started";
  message: string;
}

export const gmailApi = {
  status: () => request<GmailStatus>("/api/gmail/status"),
  connectGmail: () =>
    request<GmailAuthResponse>("/api/gmail/auth"),
  disconnect: () =>
    request<{ message: string; connected: boolean }>("/api/gmail/disconnect", {
      method: "POST",
    }),
  createDraft: (req: DraftCreationRequest) =>
    request<DraftCreationResult>("/api/gmail/draft", {
      method: "POST",
      body: JSON.stringify(req),
    }),
};
