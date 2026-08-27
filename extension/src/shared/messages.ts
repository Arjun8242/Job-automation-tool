import { ExtensionMessage, MessageType } from "./types";

/**
 * Send a message to the service worker (from popup, sidepanel, or content script).
 * Returns the response from the message handler.
 */
export function sendMessage<TPayload = unknown, TResponse = unknown>(
  type: MessageType,
  payload: TPayload,
): Promise<TResponse> {
  const message: ExtensionMessage<TPayload> = { type, payload };
  return chrome.runtime.sendMessage(message);
}

/**
 * Send a message to a specific tab's content script (from service worker).
 */
export function sendTabMessage<TPayload = unknown, TResponse = unknown>(
  tabId: number,
  type: MessageType,
  payload: TPayload,
): Promise<TResponse> {
  const message: ExtensionMessage<TPayload> = { type, payload, tabId };
  return chrome.tabs.sendMessage(tabId, message);
}

/**
 * Register a typed message handler.
 * The handler receives the full ExtensionMessage and a sendResponse callback.
 * Return true from the handler if you need to send an async response.
 */
export function onMessage(
  handler: (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => boolean | void,
): void {
  chrome.runtime.onMessage.addListener(handler);
}
