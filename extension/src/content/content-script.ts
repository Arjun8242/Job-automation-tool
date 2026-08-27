import { onMessage, sendMessage } from "../shared/messages";
import { ExtensionMessage, MessageType } from "../shared/types";
import { resetScanner, scanPage, startObserver, stopObserver } from "./scanner";

/**
 * Content script — runs on web pages.
 * Waits for explicit SCAN_PAGE from service worker before scanning.
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
      const fields = scanPage();

      // Watch for dynamically added fields
      startObserver((newFields) => {
        sendMessage(MessageType.FORM_DETECTED, {
          url: window.location.href,
          fields: newFields,
          incremental: true,
        });
      });

      // Send initial scan results
      sendMessage(MessageType.FORM_DETECTED, {
        url: window.location.href,
        fields,
      });

      sendResponse({ status: "scan_complete", fieldCount: fields.length });
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
