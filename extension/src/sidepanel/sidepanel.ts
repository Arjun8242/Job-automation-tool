import { onMessage, sendMessage } from "../shared/messages";
import { AnalysisStatus, DetectedField, ExtensionMessage, FieldCategory, FillResult, MessageType } from "../shared/types";

/**
 * Side panel — main interaction surface.
 * Shows consent gate before any scanning, then displays results.
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

/** Render the results list inside the results-state div */
function renderResults(fields: DetectedField[], fillResults: FillResult[]): void {
  const fillMap = new Map(fillResults.map((r) => [r.fieldId, r]));
  const filled = fillResults.filter((r) => r.filled);
  const questions = fields.filter((f) => f.category === FieldCategory.AI_QUESTION);
  const unknown = fields.filter((f) => f.category === FieldCategory.UNKNOWN);

  // Update status bar counts
  detectedCount.textContent = String(fields.length);
  filledCount.textContent = String(filled.length);
  questionsCount.textContent = String(questions.length);

  // Build results HTML
  let html = "";

  if (filled.length > 0) {
    html += `<div class="result-section">
      <div class="section-header">✓ Auto-filled (${filled.length})</div>
      ${filled.map((r) => {
        const field = fields.find((f) => f.id === r.fieldId);
        return `<div class="result-item filled">${field?.label || r.fieldId} → <span class="value">${r.value}</span></div>`;
      }).join("")}
    </div>`;
  }

  if (questions.length > 0) {
    html += `<div class="result-section">
      <div class="section-header">💬 AI Questions (${questions.length})</div>
      ${questions.map((f) => `<div class="result-item question">${f.label}</div>`).join("")}
    </div>`;
  }

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

  if (unknown.length > 0) {
    html += `<div class="result-section">
      <div class="section-header">? Unknown (${unknown.length})</div>
      ${unknown.map((f) => `<div class="result-item unknown">${f.label || f.id}</div>`).join("")}
    </div>`;
  }

  resultsState.innerHTML = html;
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

      status = AnalysisStatus.COMPLETE;
      pageInfo.textContent = new URL(data.url).hostname;

      if (!data.incremental) {
        renderResults(data.fields, data.fillResults || []);
      }
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
