import { onMessage, sendMessage } from "../shared/messages";
import { DetectedField, ExtensionMessage, FieldCategory, MessageType } from "../shared/types";
import { classifyFields, getAmbiguousFields } from "./classifier";
import { resetScanner, scanPage, startObserver, stopObserver } from "./scanner";

/**
 * Content script — runs on web pages.
 * Waits for explicit SCAN_PAGE from service worker, then scans and classifies.
 */

let analysisActive = false;

onMessage((message: ExtensionMessage, _sender, sendResponse) => {
  switch (message.type) {
    case MessageType.SCAN_PAGE: {
      if (analysisActive) {
        sendResponse({ status: "already_scanning" });
        return false;
      }

      analysisActive = true;

      // 1. Scan DOM for form fields
      const rawFields = scanPage();

      // 2. Classify with deterministic rules
      const classified = classifyFields(rawFields);

      // 3. Request LLM classification for ambiguous fields
      const ambiguous = getAmbiguousFields(classified);
      if (ambiguous.length > 0) {
        sendMessage(MessageType.CLASSIFY_FIELDS, ambiguous)
          .then((response) => {
            const llmResults = response as DetectedField[] | undefined;
            if (llmResults) {
              mergeClassifications(classified, llmResults);
            }
            broadcastResults(classified);
          })
          .catch(() => {
            // LLM failed — still send what we have
            broadcastResults(classified);
          });
      } else {
        broadcastResults(classified);
      }

      // 4. Watch for dynamically added fields
      startObserver((newFields) => {
        const classifiedNew = classifyFields(newFields);
        sendMessage(MessageType.FORM_DETECTED, {
          url: window.location.href,
          fields: classifiedNew,
          incremental: true,
        });
      });

      sendResponse({ status: "scan_complete", fieldCount: classified.length });
      return false;
    }

    case MessageType.STOP_ANALYSIS: {
      analysisActive = false;
      stopObserver();
      resetScanner();
      sendResponse({ status: "stopped" });
      return false;
    }

    default:
      return false;
  }
});

/** Merge LLM classifications back into the main field list */
function mergeClassifications(fields: DetectedField[], llmResults: DetectedField[]): void {
  const llmMap = new Map(llmResults.map((f) => [f.id, f]));
  for (const field of fields) {
    const llmField = llmMap.get(field.id);
    if (llmField && llmField.category !== FieldCategory.UNKNOWN) {
      field.category = llmField.category;
      field.confidence = llmField.confidence;
    }
  }
}

/** Send classified fields to the side panel via service worker */
function broadcastResults(fields: DetectedField[]): void {
  sendMessage(MessageType.FORM_DETECTED, {
    url: window.location.href,
    fields,
  });
}
