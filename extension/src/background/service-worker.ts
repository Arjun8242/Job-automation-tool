import { onMessage, sendTabMessage } from "../shared/messages";
import { AnalysisStatus, ExtensionMessage, MessageType } from "../shared/types";

/**
 * Service worker — central message router for the extension.
 * Routes messages between popup, side panel, and content scripts.
 */

// Track analysis status per tab
const tabStatus = new Map<number, AnalysisStatus>();

onMessage((message: ExtensionMessage, sender, sendResponse) => {
  switch (message.type) {
    case MessageType.OPEN_SIDE_PANEL: {
      const tabId = sender.tab?.id ?? message.tabId;
      if (tabId) {
        chrome.sidePanel.open({ tabId }).catch(console.error);
        sendResponse({ success: true });
        return false;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTabId = tabs[0]?.id;
        if (activeTabId) {
          chrome.sidePanel.open({ tabId: activeTabId }).catch(console.error);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "No active tab" });
        }
      });
      return true;
    }

    case MessageType.ANALYZE_PAGE: {
      // User explicitly allowed page analysis — forward SCAN_PAGE to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) {
          sendResponse({ error: "No active tab found" });
          return;
        }

        tabStatus.set(tabId, AnalysisStatus.ANALYZING);

        sendTabMessage(tabId, MessageType.SCAN_PAGE, {})
          .then((result) => {
            tabStatus.set(tabId, AnalysisStatus.COMPLETE);
            sendResponse(result);
          })
          .catch((err) => {
            tabStatus.set(tabId, AnalysisStatus.ERROR);
            sendResponse({ error: err.message });
          });
      });
      return true; // async response
    }

    case MessageType.STOP_ANALYSIS: {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (tabId) {
          tabStatus.set(tabId, AnalysisStatus.IDLE);
          sendTabMessage(tabId, MessageType.STOP_ANALYSIS, {}).catch(() => {});
        }
        sendResponse({ success: true });
      });
      return true;
    }

    case MessageType.SCAN_PAGE: {
      // Legacy direct scan — forward to active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (tabId) {
          sendTabMessage(tabId, MessageType.SCAN_PAGE, message.payload)
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));
        } else {
          sendResponse({ error: "No active tab found" });
        }
      });
      return true;
    }

    case MessageType.CLASSIFY_FIELDS: {
      // Content script sent ambiguous fields — ask the backend LLM
      const BACKEND_URL = "http://localhost:8000/api/fields/classify";
      fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: message.payload }),
      })
        .then((res) => res.json())
        .then((data) => sendResponse(data.fields ?? []))
        .catch(() => sendResponse([]));
      return true; // async response
    }

    case MessageType.GET_PROFILE: {
      fetch("http://localhost:8000/api/profile")
        .then((res) => res.json())
        .then((data) => sendResponse(data))
        .catch(() => sendResponse(null));
      return true;
    }

    case MessageType.GET_RESUMES: {
      fetch("http://localhost:8000/api/resumes/")
        .then((res) => res.json())
        .then((data) => sendResponse(data))
        .catch(() => sendResponse([]));
      return true;
    }

    case MessageType.ATTACH_RESUME: {
      const payload = message.payload as { fieldId: string; filename: string; tabId?: number };
      const filename = payload.filename || "software-engineer.pdf";

      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tabId = payload.tabId ?? tabs[0]?.id;
        if (!tabId) {
          sendResponse({ success: false, error: "No active tab" });
          return;
        }

        try {
          const res = await fetch(`http://localhost:8000/api/resumes/file/${encodeURIComponent(filename)}`);
          if (!res.ok) throw new Error(`Failed to fetch resume: ${res.statusText}`);
          const buffer = await res.arrayBuffer();

          // Convert ArrayBuffer to binary string / base64 for message passing
          let binary = "";
          const bytes = new Uint8Array(buffer);
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          const result = await sendTabMessage(tabId, MessageType.ATTACH_RESUME, {
            fieldId: payload.fieldId,
            filename,
            base64,
          });

          sendResponse(result);
        } catch (err: any) {
          console.error("Attach resume error:", err);
          sendResponse({ success: false, error: err.message });
        }
      });
      return true;
    }

    case MessageType.FORM_DETECTED: {
      sendResponse({ received: true });
      return false;
    }

    case MessageType.ERROR: {
      console.error("[AI Job Copilot] Error:", message.payload);
      sendResponse({ received: true });
      return false;
    }

    default:
      return false;
  }
});

// Enable side panel on extension install
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});
