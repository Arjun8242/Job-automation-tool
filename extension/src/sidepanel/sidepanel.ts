import { onMessage, sendMessage } from "../shared/messages";
import { AnalysisStatus, ExtensionMessage, MessageType } from "../shared/types";

/**
 * Side panel — main interaction surface.
 * Shows consent gate before any scanning, then displays results.
 */

// DOM elements
const pageInfo = document.getElementById("page-info") as HTMLDivElement;
const statusBar = document.getElementById("status-bar") as HTMLDivElement;
const detectedCount = document.getElementById("detected-count") as HTMLSpanElement;
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

// Listen for results from service worker / content script
onMessage((message: ExtensionMessage, _sender, sendResponse) => {
  switch (message.type) {
    case MessageType.FORM_DETECTED: {
      const data = message.payload as { url: string; fields: unknown[] };
      status = AnalysisStatus.COMPLETE;
      pageInfo.textContent = new URL(data.url).hostname;
      detectedCount.textContent = String(data.fields.length);
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
