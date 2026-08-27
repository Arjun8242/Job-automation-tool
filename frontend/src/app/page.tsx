"use client";

import { useState, useEffect } from "react";
import { templatesApi, resumesApi, outreachApi, gmailApi } from "@/lib/api";
import type {
  EmailTemplate,
  JDExtractionResult,
  GeneratedEmail,
  GmailStatus,
} from "@/types";

export default function OutreachCopilotPage() {
  // ── Form State ──
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [recruiterEmail, setRecruiterEmail] = useState("");
  const [recruiterName, setRecruiterName] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [templateId, setTemplateId] = useState("direct-concise");
  const [selectedResume, setSelectedResume] = useState<string>("");
  const [notes, setNotes] = useState("");

  // ── Data & Catalogs ──
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [availableResumes, setAvailableResumes] = useState<string[]>([]);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);

  // ── AI Results State ──
  const [jdEssentials, setJdEssentials] = useState<JDExtractionResult | null>(null);
  const [generatedEmail, setGeneratedEmail] = useState<GeneratedEmail | null>(null);
  const [editableSubject, setEditableSubject] = useState("");
  const [editableBody, setEditableBody] = useState("");

  // ── Loading & Feedback State ──
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "danger" | "warning" } | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastDraftUrl, setLastDraftUrl] = useState<string | null>(null);

  const showToast = (msg: string, type: "success" | "danger" | "warning" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Initial Data Fetch ──
  useEffect(() => {
    templatesApi.list()
      .then((t) => {
        setTemplates(t);
        if (t.length > 0) setTemplateId(t[0].id);
      })
      .catch(() => showToast("Could not load templates", "warning"));

    resumesApi.list()
      .then((r) => {
        setAvailableResumes(r);
        if (r.length > 0) setSelectedResume(r[0]);
      })
      .catch(() => showToast("Could not load resumes list", "warning"));

    gmailApi.status()
      .then(setGmailStatus)
      .catch(() => setGmailStatus({ connected: false }));
  }, []);

  // ── Action 1: Extract JD Essentials Only ──
  const handleExtractJD = async () => {
    if (!jobDescription.trim()) {
      showToast("Please paste a Job Description first", "warning");
      return;
    }
    setIsExtracting(true);
    try {
      const result = await outreachApi.extractJD({
        company: company.trim() || "Target Company",
        role: role.trim() || "Software Engineer",
        job_description: jobDescription,
        recruiter_name: recruiterName,
        recruiter_email: recruiterEmail,
      });
      setJdEssentials(result);
      if (result.company && (!company || company === "Target Company")) setCompany(result.company);
      if (result.role && (!role || role === "Software Engineer")) setRole(result.role);

      // Auto-pick resume if matched
      if (result.recommended_resume && availableResumes.length > 0) {
        const matched = availableResumes.find((r) =>
          r.toLowerCase().includes(result.recommended_resume!.toLowerCase())
        );
        if (matched) setSelectedResume(matched);
      }

      showToast("Extracted skills and recommended project!", "success");
    } catch (err: any) {
      showToast(`Extraction error: ${err.message}`, "danger");
    } finally {
      setIsExtracting(false);
    }
  };

  // ── Action 2: Generate Full Cold Email ──
  const handleGenerateEmail = async () => {
    if (!jobDescription.trim()) {
      showToast("Please paste the Job Description", "warning");
      return;
    }
    if (!company.trim()) {
      showToast("Please enter the Company name", "warning");
      return;
    }
    if (!role.trim()) {
      showToast("Please enter the Role title", "warning");
      return;
    }

    setIsGenerating(true);
    try {
      const email = await outreachApi.generateEmail({
        company: company.trim(),
        role: role.trim(),
        recruiter_email: recruiterEmail.trim(),
        recruiter_name: recruiterName.trim() || undefined,
        job_description: jobDescription,
        template_id: templateId,
        selected_resume: selectedResume || undefined,
        notes: notes.trim() || undefined,
      });

      setGeneratedEmail(email);
      setEditableSubject(email.subject);
      setEditableBody(email.body);
      if (email.selected_resume) setSelectedResume(email.selected_resume);

      showToast("Cold email generated and humanized with your real project!", "success");
    } catch (err: any) {
      showToast(`Generation error: ${err.message}`, "danger");
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Action 3: Copy to Clipboard ──
  const handleCopy = () => {
    if (!editableBody) return;
    const fullText = `Subject: ${editableSubject}\n\n${editableBody}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    showToast("Email copied to clipboard!", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Action 4: Create Gmail Draft ──
  const handleCreateDraft = async () => {
    if (!recruiterEmail.trim()) {
      showToast("Enter HR/Recruiter Email to create draft", "warning");
      return;
    }
    if (!editableBody.trim()) {
      showToast("Generate an email first", "warning");
      return;
    }

    // Check Gmail connection first
    if (!gmailStatus?.connected) {
      showToast("Gmail not connected. Click 'Connect Gmail' in the header first.", "warning");
      return;
    }

    setIsDrafting(true);
    setLastDraftUrl(null);
    try {
      const result = await gmailApi.createDraft({
        recruiter_email: recruiterEmail.trim(),
        subject: editableSubject,
        body: editableBody,
        resume_filename: selectedResume || undefined,
      });
      showToast(result.message || "Draft created in Gmail!", "success");
      if (result.draft_url) {
        setLastDraftUrl(result.draft_url);
        window.open(result.draft_url, "_blank");
      }
    } catch (err: any) {
      showToast(`Draft error: ${err.message}`, "danger");
    } finally {
      setIsDrafting(false);
    }
  };

  // ── Action 5: Connect Gmail ──
  const handleConnectGmail = async () => {
    setIsConnecting(true);
    try {
      const result = await gmailApi.connectGmail();
      if (result.status === "already_connected") {
        showToast("Gmail is already connected!", "success");
        // Refresh status to get email
        const status = await gmailApi.status();
        setGmailStatus(status);
      } else if (result.status === "flow_started") {
        showToast("Browser opened for Google sign-in. Complete it there, then click 'Refresh Status'.", "success");
      } else {
        showToast(result.message, "warning");
      }
    } catch (err: any) {
      showToast(`Gmail connect error: ${err.message}`, "danger");
    } finally {
      setIsConnecting(false);
    }
  };

  // ── Action 6: Refresh Gmail Status ──
  const handleRefreshGmailStatus = async () => {
    try {
      const status = await gmailApi.status();
      setGmailStatus(status);
      if (status.connected) {
        showToast(`Gmail connected as ${status.email || 'unknown'}!`, "success");
      } else {
        showToast("Gmail is not connected yet.", "warning");
      }
    } catch {
      showToast("Could not check Gmail status", "danger");
    }
  };

  // ── Action 7: Disconnect Gmail ──
  const handleDisconnectGmail = async () => {
    try {
      await gmailApi.disconnect();
      setGmailStatus({ connected: false });
      showToast("Gmail disconnected.", "success");
    } catch (err: any) {
      showToast(`Disconnect error: ${err.message}`, "danger");
    }
  };

  const selectedTemplateObj = templates.find((t) => t.id === templateId);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-base)" }}>
      {/* ── Top Header ── */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "0 2rem",
          display: "flex",
          alignItems: "center",
          height: 64,
          gap: "1.5rem",
          background: "var(--bg-surface)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--accent-muted)",
              border: "1px solid var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            }}
          >
            ✉️
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
              AI Job Application Copilot
            </h1>
            <p style={{ fontSize: 11, color: "var(--text-muted)" }}>V1 — Cold Email Automation</p>
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {gmailStatus?.connected ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="tag" style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid rgba(74,222,128,0.3)" }}>
                ✓ {gmailStatus.email || "Gmail Connected"}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleDisconnectGmail}
                style={{ fontSize: 11, padding: "0.2rem 0.5rem", color: "var(--text-muted)" }}
                title="Disconnect Gmail"
              >
                ✕
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleConnectGmail}
                disabled={isConnecting}
                style={{ fontSize: 12 }}
              >
                {isConnecting ? "Connecting…" : "🔗 Connect Gmail"}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleRefreshGmailStatus}
                style={{ fontSize: 11, padding: "0.2rem 0.5rem" }}
                title="Refresh Gmail status"
              >
                ↻
              </button>
            </div>
          )}
          <span className="tag" style={{ background: "var(--accent-muted)", color: "var(--accent-hover)" }}>
            Gemini 3.6 Flash Active
          </span>
        </div>
      </header>

      {/* ── Main Workspace ── */}
      <main style={{ flex: 1, padding: "1.75rem 2rem", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: "1.75rem", alignItems: "start" }}>

          {/* ════════ LEFT COLUMN: INPUTS & JD CONTEXT ════════ */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            
            {/* Input Details Card */}
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 className="section-title" style={{ margin: 0, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                  1. Opportunity & Contact
                </h2>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Personal data loaded from JSON</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
                <div>
                  <label className="label">Company *</label>
                  <input
                    className="input"
                    placeholder="e.g. Razorpay, Google"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Role Title *</label>
                  <input
                    className="input"
                    placeholder="e.g. Backend Developer Intern"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "0.85rem" }}>
                <div>
                  <label className="label">HR / Recruiter Email *</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="recruiter@company.com"
                    value={recruiterEmail}
                    onChange={(e) => setRecruiterEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Recruiter Name (Optional)</label>
                  <input
                    className="input"
                    placeholder="e.g. Rahul, Sarah"
                    value={recruiterName}
                    onChange={(e) => setRecruiterName(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
                <div>
                  <label className="label">Template</label>
                  <select
                    className="input"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    style={{ cursor: "pointer" }}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id} style={{ background: "var(--bg-elevated)" }}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {selectedTemplateObj?.description && (
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      {selectedTemplateObj.description}
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">Resume (from data/resumes/)</label>
                  <select
                    className="input"
                    value={selectedResume}
                    onChange={(e) => setSelectedResume(e.target.value)}
                    style={{ cursor: "pointer" }}
                  >
                    {availableResumes.length === 0 ? (
                      <option value="">No PDF found in data/resumes/</option>
                    ) : (
                      availableResumes.map((r) => (
                        <option key={r} value={r} style={{ background: "var(--bg-elevated)" }}>
                          {r}
                        </option>
                      ))
                    )}
                  </select>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    Auto-selected based on JD stack
                  </p>
                </div>
              </div>
            </div>

            {/* Job Description Card */}
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="label" style={{ margin: 0 }}>
                  2. Paste Job Description (JD) *
                </label>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleExtractJD}
                  disabled={isExtracting || !jobDescription.trim()}
                  style={{ fontSize: 11 }}
                >
                  {isExtracting ? "Analyzing…" : "⚡ Quick Extract JD"}
                </button>
              </div>

              <textarea
                className="input"
                rows={8}
                placeholder="Paste the full job posting or responsibilities & requirements here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                style={{ fontSize: 13, lineHeight: 1.5 }}
              />

              <div>
                <label className="label">Additional Custom Notes (Optional)</label>
                <input
                  className="input"
                  placeholder="e.g. Highlight distributed systems or mention immediate availability"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <button
                className="btn btn-primary"
                onClick={handleGenerateEmail}
                disabled={isGenerating || !jobDescription.trim()}
                style={{ justifyContent: "center", padding: "0.75rem", fontSize: 15, fontWeight: 600 }}
              >
                {isGenerating ? "Generating Personalized Cold Email…" : "🚀 Generate Cold Email"}
              </button>
            </div>

            {/* JD Essentials Card (If extracted or generated) */}
            {jdEssentials && (
              <div className="card animate-fade-in" style={{ background: "var(--bg-elevated)", borderColor: "var(--accent-muted)" }}>
                <p className="section-title" style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--accent-hover)", marginBottom: 8 }}>
                  🎯 JD Extracted Essentials
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Key Required Skills: </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {jdEssentials.skills.map((s) => (
                        <span key={s} className="tag">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  {jdEssentials.recommended_projects.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: "var(--text-muted)" }}>Matched Project from Your Knowledge Base: </span>
                      <strong style={{ color: "var(--success)" }}>
                        {jdEssentials.recommended_projects.join(", ")}
                      </strong>
                    </div>
                  )}
                  {jdEssentials.recommended_resume && (
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Recommended Resume Focus: </span>
                      <span className="tag" style={{ background: "var(--accent-muted)" }}>
                        {jdEssentials.recommended_resume}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ════════ RIGHT COLUMN: EMAIL REVIEW & ACTIONS ════════ */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem", minHeight: 600 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 className="section-title" style={{ margin: 0, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                  3. Generated Cold Email Review
                </h2>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleCopy}
                    disabled={!editableBody}
                  >
                    {copied ? "✓ Copied" : "📋 Copy"}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleGenerateEmail}
                    disabled={isGenerating || !jobDescription.trim()}
                  >
                    ⚡ Regenerate
                  </button>
                </div>
              </div>

              {/* Subject Line */}
              <div>
                <label className="label">Subject Line</label>
                <input
                  className="input"
                  value={editableSubject}
                  onChange={(e) => setEditableSubject(e.target.value)}
                  placeholder="Subject line will appear here..."
                  style={{ fontWeight: 600, color: "var(--accent-hover)" }}
                />
              </div>

              {/* Email Body */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <label className="label">Email Body (Editable)</label>
                <textarea
                  className="input"
                  style={{
                    flex: 1,
                    minHeight: 320,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 13.5,
                    lineHeight: 1.65,
                    whiteSpace: "pre-wrap",
                  }}
                  value={editableBody}
                  onChange={(e) => setEditableBody(e.target.value)}
                  placeholder="Your tailored cold email will be generated here using your verified projects and experience..."
                />
              </div>

              {/* Verified Links Preview */}
              {generatedEmail && generatedEmail.links.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <label className="label" style={{ marginBottom: 4 }}>
                    Verified Portfolio & Project Links Included:
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {generatedEmail.links.map((link, idx) => (
                      <a
                        key={idx}
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="tag"
                        style={{ textDecoration: "none", color: "var(--accent-hover)" }}
                      >
                        🔗 {link.replace(/^https?:\/\/(www\.)?/, "")} ↗
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Final Action Bar */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleCreateDraft}
                    disabled={isDrafting || !editableBody || !recruiterEmail}
                    style={{ flex: 1, justifyContent: "center", padding: "0.75rem", fontSize: 14, fontWeight: 600 }}
                  >
                    {isDrafting ? "Creating Gmail Draft…" : "✉️ Create Gmail Draft"}
                  </button>
                </div>
                {lastDraftUrl && (
                  <div className="animate-fade-in" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ color: "var(--success)" }}>✓ Draft created!</span>
                    <a
                      href={lastDraftUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--accent-hover)", textDecoration: "underline" }}
                    >
                      Open in Gmail ↗
                    </a>
                  </div>
                )}
                {!gmailStatus?.connected && editableBody && (
                  <p style={{ fontSize: 11, color: "var(--warning)", margin: 0 }}>
                    ⚠ Connect Gmail above to create drafts directly.
                  </p>
                )}
              </div>

              {/* Guardrail Note */}
              <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", margin: 0 }}>
                🛡️ <strong>Strict Fact Grounding Active</strong>: The AI is restricted to facts in your personal profile (<code style={{ color: "var(--text-secondary)" }}>data/profile.json</code>) & projects (<code style={{ color: "var(--text-secondary)" }}>data/projects.json</code>).
              </p>
            </div>
          </div>

        </div>
      </main>

      {/* ── Toast Notification ── */}
      {toast && (
        <div
          className={`alert alert-${toast.type} animate-fade-in`}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9999,
            minWidth: 280,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          <span>{toast.type === "success" ? "✓" : toast.type === "warning" ? "⚠" : "✕"}</span>
          <span>{toast.msg}</span>
          <button
            onClick={() => setToast(null)}
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "auto", padding: "0 4px" }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
