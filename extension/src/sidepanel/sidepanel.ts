import { onMessage, sendMessage } from "../shared/messages";
import {
  AnalysisStatus,
  AttachResumeResult,
  DetectedField,
  ExtensionMessage,
  FieldCategory,
  FillResult,
  MessageType,
} from "../shared/types";

/**
 * Side panel — main interaction surface.
 * Shows consent gate, displays auto-fill results, AI questions,
 * and allows resume selection/attachment.
 */

// DOM elements
const pageInfo = document.getElementById("page-info") as HTMLDivElement;
const statusBar = document.getElementById("status-bar") as HTMLDivElement;
const detectedCount = document.getElementById("detected-count") as HTMLSpanElement;
const filledCount = document.getElementById("filled-count") as HTMLSpanElement;
const questionsCount = document.getElementById("questions-count") as HTMLSpanElement;
const consentGate = document.getElementById("consent-gate") as HTMLDivElement;
const analyzingState = document.getElementById("analyzing-state") as HTMLDivElement;
const resultsState = document.getElementById("results-state") as HTMLDivElement;
const analyzeBtn = document.getElementById("analyze-btn") as HTMLButtonElement;
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;

let status: AnalysisStatus = AnalysisStatus.IDLE;
let detectedFields: DetectedField[] = [];
let fillResults: FillResult[] = [];
let availableResumes: string[] = [];

/** Show the correct UI section based on analysis status */
function updateUI() {
  consentGate.classList.toggle("hidden", status !== AnalysisStatus.IDLE);
  analyzingState.classList.toggle("hidden", status !== AnalysisStatus.ANALYZING);
  resultsState.classList.toggle("hidden", status !== AnalysisStatus.COMPLETE);
  statusBar.classList.toggle("hidden", status !== AnalysisStatus.COMPLETE);
}

// Analyze button — user explicitly consents to page analysis
analyzeBtn.addEventListener("click", async () => {
  status = AnalysisStatus.ANALYZING;
  analyzeBtn.disabled = true;
  updateUI();

  try {
    // Also preload available resumes from backend
    availableResumes = (await sendMessage<unknown, string[]>(MessageType.GET_RESUMES, {})) || [];
    await sendMessage(MessageType.ANALYZE_PAGE, {});
  } catch {
    status = AnalysisStatus.ERROR;
    pageInfo.textContent = "Analysis failed";
    resetToIdle();
  }
});

// Stop button — cancel ongoing analysis
stopBtn.addEventListener("click", async () => {
  await sendMessage(MessageType.STOP_ANALYSIS, {});
  resetToIdle();
});

function resetToIdle() {
  status = AnalysisStatus.IDLE;
  analyzeBtn.disabled = false;
  updateUI();
}

/** Render resume attachment card if a resume field is detected */
function renderResumeCard(resumeField: DetectedField): string {
  const resumes = availableResumes;
  const defaultResume = resumes[0];

  const options = resumes.length > 0
    ? resumes
        .map((r) => `<option value="${r}" ${r === defaultResume ? "selected" : ""}>${r}</option>`)
        .join("")
    : '<option value="" selected>No PDF resumes available</option>';

  return `
    <div class="resume-card" id="resume-section" data-field-id="${resumeField.id}">
      <div class="title">📄 Resume Upload Detected</div>
      <div class="desc">Detected upload field: <em>${resumeField.label || "Resume / CV"}</em></div>
      <select class="resume-select" id="resume-select">
        ${options}
      </select>
      <button class="btn btn-secondary" id="attach-resume-btn" ${resumes.length === 0 ? "disabled" : ""}>Attach Resume to Form</button>
      <div class="resume-badge hidden" id="resume-status"></div>
    </div>
  `;
}

/** Attach event listener to the dynamically rendered resume card */
function wireResumeCard(resumeField: DetectedField) {
  const attachBtn = document.getElementById("attach-resume-btn") as HTMLButtonElement | null;
  const selectEl = document.getElementById("resume-select") as HTMLSelectElement | null;
  const statusEl = document.getElementById("resume-status") as HTMLDivElement | null;

  if (!attachBtn || !selectEl || !statusEl) return;

  const doAttach = async () => {
    const filename = selectEl.value;
    if (!filename) {
      statusEl.className = "resume-badge error";
      statusEl.textContent = "⚠ Add a PDF resume to data/resumes and retry analysis.";
      statusEl.classList.remove("hidden");
      return;
    }

    attachBtn.disabled = true;
    attachBtn.textContent = "Attaching...";

    try {
      const res = await sendMessage<unknown, AttachResumeResult>(MessageType.ATTACH_RESUME, {
        fieldId: resumeField.id,
        filename,
      });

      if (res && res.success) {
        statusEl.className = "resume-badge";
        statusEl.textContent = `✓ Attached ${filename} to form`;
        statusEl.classList.remove("hidden");
        attachBtn.textContent = "Re-attach Resume";
      } else {
        statusEl.className = "resume-badge error";
        statusEl.textContent = `⚠ Could not auto-inject file. Please select ${filename} manually.`;
        statusEl.classList.remove("hidden");
        attachBtn.textContent = "Try Attach Again";
      }
    } catch (err: any) {
      statusEl.className = "resume-badge error";
      statusEl.textContent = `⚠ Attachment failed: ${err.message}`;
      statusEl.classList.remove("hidden");
      attachBtn.textContent = "Attach Resume to Form";
    } finally {
      attachBtn.disabled = false;
    }
  };

  attachBtn.addEventListener("click", doAttach);

  // Auto-attach default resume on initial scan
  doAttach();
}

/** Render the results list inside the results-state div */
function renderResults(fields: DetectedField[], fillResults: FillResult[]): void {
  const fillMap = new Map(fillResults.map((r) => [r.fieldId, r]));
  const filled = fillResults.filter((r) => r.filled);
  const questions = fields.filter((f) => f.category === FieldCategory.AI_QUESTION);
  const unknown = fields.filter((f) => f.category === FieldCategory.UNKNOWN);
  const resumeField = fields.find((f) => f.category === FieldCategory.RESUME || f.type === "file");

  // Update status bar counts
  detectedCount.textContent = String(fields.length);
  filledCount.textContent = String(filled.length);
  questionsCount.textContent = String(questions.length);

  let html = "";

  // 1. Resume Card (if resume field detected)
  if (resumeField) {
    html += renderResumeCard(resumeField);
  }

  // 2. Auto-filled section
  if (filled.length > 0) {
    html += `<div class="result-section">
      <div class="section-header">✓ Auto-filled (${filled.length})</div>
      ${filled.map((r) => {
        const field = fields.find((f) => f.id === r.fieldId);
        const options = field?.options?.length ? ` (${field.options.join(", ")})` : "";
        return `<div class="result-item filled">${field?.label || r.fieldId}${options} → <span class="value">${r.value}</span></div>`;
      }).join("")}
    </div>`;
  }

  // 3. Dropdown fields and their available choices
  const dropdowns = fields.filter((field) => field.type === "select" && (field.options?.length ?? 0) > 0);
  if (dropdowns.length > 0) {
    html += `<div class="result-section">
      <div class="section-header">▾ Dropdowns analyzed (${dropdowns.length})</div>
      ${dropdowns.map((field) => `<div class="result-item">${field.label || field.id}<br><span class="value">${field.options?.join(" · ")}</span></div>`).join("")}
    </div>`;
  }

  // 4. AI Questions section
  if (questions.length > 0) {
    html += `<div class="result-section">
      <div class="section-header">💬 AI Questions Detected (${questions.length})</div>
      ${questions
        .map(
          (f) => `
        <div class="result-item question">
          <div class="q-title">${f.label || "Custom Application Question"}</div>
          <div class="q-meta">${f.required ? "Required • " : ""}${f.type === "textarea" ? "Long answer" : "Short answer"} (Ready for Phase 8/9 Generation)</div>
        </div>
      `
        )
        .join("")}
    </div>`;
  }

  // 5. Skipped fields
  const skipped = fields.filter((f) => {
    const r = fillMap.get(f.id);
    return r && !r.filled && r.skipped === "non-empty";
  });
  if (skipped.length > 0) {
    html += `<div class="result-section">
      <div class="section-header">⏭ Skipped — already filled (${skipped.length})</div>
      ${skipped.map((f) => `<div class="result-item skipped">${f.label}</div>`).join("")}
    </div>`;
  }

  // 6. Unknown fields
  if (unknown.length > 0) {
    html += `<div class="result-section">
      <div class="section-header">? Unknown (${unknown.length})</div>
      ${unknown.map((f) => `<div class="result-item unknown">${f.label || f.id}</div>`).join("")}
    </div>`;
  }

  resultsState.innerHTML = html;

  if (resumeField) {
    wireResumeCard(resumeField);
  }
}

// Listen for results from service worker / content script
onMessage((message: ExtensionMessage, _sender, sendResponse) => {
  switch (message.type) {
    case MessageType.FORM_DETECTED: {
      const data = message.payload as {
        url: string;
        fields: DetectedField[];
        fillResults?: FillResult[];
        incremental?: boolean;
      };

      if (data.incremental) {
        detectedFields = [...detectedFields, ...data.fields];
        fillResults = [...fillResults, ...(data.fillResults || [])];
      } else {
        detectedFields = data.fields;
        fillResults = data.fillResults || [];
      }

      status = AnalysisStatus.COMPLETE;
      pageInfo.textContent = new URL(data.url).hostname;
      renderResults(detectedFields, fillResults);
      updateUI();
      sendResponse({ received: true });
      return false;
    }

    case MessageType.ERROR: {
      pageInfo.textContent = "Analysis failed";
      resetToIdle();
      sendResponse({ received: true });
      return false;
    }

    default:
      return false;
  }
});
