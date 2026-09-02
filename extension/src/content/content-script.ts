import { onMessage, sendMessage } from "../shared/messages";
import { DetectedField, ExtensionMessage, FieldCategory, FillResult, MessageType } from "../shared/types";
import { classifyFields, getAmbiguousFields } from "./classifier";
import { attachResumeToInput, fillFields } from "./filler";
import { resetScanner, scanPage, startObserver, stopObserver } from "./scanner";

/**
 * Content script — runs on web pages.
 * Waits for explicit SCAN_PAGE, then scans, classifies, and fills.
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

      // 3. Request LLM classification for ambiguous fields, then fill
      const ambiguous = getAmbiguousFields(classified);
      if (ambiguous.length > 0) {
        sendMessage(MessageType.CLASSIFY_FIELDS, ambiguous)
          .then((response) => {
            const llmResults = response as DetectedField[] | undefined;
            if (llmResults) mergeClassifications(classified, llmResults);
          })
          .catch(() => {})
          .finally(() => fillAndBroadcast(classified));
      } else {
        fillAndBroadcast(classified);
      }

      // 4. Watch for dynamically added fields
      startObserver((newFields) => {
        const classifiedNew = classifyFields(newFields);
        fillAndBroadcast(classifiedNew, true);
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

    case MessageType.ATTACH_RESUME: {
      const { fieldId, filename, base64 } = message.payload as {
        fieldId: string;
        filename: string;
        base64: string;
      };

      try {
        // Decode base64 into ArrayBuffer
        const binaryStr = atob(base64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const success = attachResumeToInput(fieldId, bytes.buffer, filename);
        sendResponse({ success, filename, fieldId });
      } catch (err: any) {
        console.error("[AI Job Copilot] Attachment error:", err);
        sendResponse({ success: false, error: err.message });
      }
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

/** Fetch profile, fill fields, then broadcast results to the side panel */
function fillAndBroadcast(fields: DetectedField[], incremental = false): void {
  sendMessage<unknown, Record<string, unknown> | null>(MessageType.GET_PROFILE, {})
    .then((profile) => {
      let fillResults: FillResult[] = [];
      if (profile) {
        fillResults = fillFields(fields, profile);
      }

      sendMessage(MessageType.FORM_DETECTED, {
        url: window.location.href,
        fields,
        fillResults,
        incremental,
      });
    })
    .catch(() => {
      // Profile fetch failed — still send fields without filling
      sendMessage(MessageType.FORM_DETECTED, {
        url: window.location.href,
        fields,
        fillResults: [],
        incremental,
      });
    });
}
