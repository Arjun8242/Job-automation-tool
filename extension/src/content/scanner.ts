import { DetectedField, FieldCategory } from "../shared/types";

/**
 * DOM Form Scanner — detects form fields on the current page.
 * Extracts labels, types, required status, and existing values.
 */

/** Elements we've already scanned (prevents duplicates on re-scan / MutationObserver) */
const scannedElements = new WeakSet<Element>();

/** Map of field ID → DOM element (used by filler to set values) */
const elementMap = new Map<string, HTMLElement>();

/** Monotonic counter for generating unique field IDs */
let fieldCounter = 0;

/** Selectors for form-related elements */
const FIELD_SELECTOR = "input, textarea, select";

/** Input types to skip */
const IGNORED_TYPES = new Set([
  "hidden", "submit", "reset", "button", "image",
]);

/**
 * Check if an element is visible and not aria-hidden.
 */
function isVisible(el: HTMLElement): boolean {
  if (el.getAttribute("aria-hidden") === "true") return false;
  const style = getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

/**
 * Resolve the best label text for a form element.
 * Priority: <label for> → parent <label> → aria-label → aria-labelledby → placeholder → name → ""
 */
function resolveLabel(el: HTMLElement): string {
  // 1. <label for="id">
  if (el.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }

  // 2. Parent <label>
  const parentLabel = el.closest("label");
  if (parentLabel) {
    // Get label text without the input's own value
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, textarea, select").forEach((c) => c.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }

  // 3. aria-label
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();

  // 4. aria-labelledby
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const parts = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
    if (parts.length) return parts.join(" ");
  }

  // 5. placeholder
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.placeholder?.trim()) return el.placeholder.trim();
  }

  // 6. name attribute (humanize it)
  const name = el.getAttribute("name");
  if (name) return name.replace(/[_\-\[\]]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();

  return "";
}

/**
 * Get the current value of a form element.
 */
function getValue(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) return el.value;
  if (el instanceof HTMLTextAreaElement) return el.value;
  if (el instanceof HTMLSelectElement) return el.value;
  return "";
}

/**
 * Get the input type string for a form element.
 */
function getFieldType(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLSelectElement) return "select";
  if (el instanceof HTMLInputElement) return el.type || "text";
  return "text";
}

/**
 * Check if a form element is required.
 */
function isRequired(el: HTMLElement): boolean {
  if ((el as HTMLInputElement).required) return true;
  if (el.getAttribute("aria-required") === "true") return true;

  // Check if the associated label contains a "*" indicator
  const label = resolveLabel(el);
  return label.includes("*");
}

/**
 * Scan a single element and return a DetectedField, or null if it should be skipped.
 */
function scanElement(el: HTMLElement): DetectedField | null {
  if (scannedElements.has(el)) return null;

  const type = getFieldType(el);
  if (IGNORED_TYPES.has(type)) return null;
  if (!isVisible(el)) return null;

  scannedElements.add(el);
  fieldCounter++;

  const fieldId = el.id || `field-${fieldCounter}`;
  elementMap.set(fieldId, el);

  return {
    id: fieldId,
    label: resolveLabel(el),
    type,
    required: isRequired(el),
    value: getValue(el),
    category: FieldCategory.UNKNOWN,
    confidence: "low",
  };
}

/**
 * Scan the entire page for form fields.
 * Returns an array of detected fields.
 */
export function scanPage(): DetectedField[] {
  const elements = document.querySelectorAll<HTMLElement>(FIELD_SELECTOR);
  const fields: DetectedField[] = [];

  for (const el of elements) {
    const field = scanElement(el);
    if (field) fields.push(field);
  }

  return fields;
}

/**
 * Scan only newly added elements (used by MutationObserver).
 */
export function scanNewElements(root: Element): DetectedField[] {
  const elements = root.querySelectorAll<HTMLElement>(FIELD_SELECTOR);
  const fields: DetectedField[] = [];

  // Also check if root itself is a form element
  if (root instanceof HTMLElement && root.matches(FIELD_SELECTOR)) {
    const field = scanElement(root);
    if (field) fields.push(field);
  }

  for (const el of elements) {
    const field = scanElement(el);
    if (field) fields.push(field);
  }

  return fields;
}

/** MutationObserver instance — stored so it can be disconnected on stop */
let observer: MutationObserver | null = null;

/**
 * Start observing the DOM for dynamically added form fields.
 * Calls `onNewFields` whenever new fields are detected.
 */
export function startObserver(onNewFields: (fields: DetectedField[]) => void): void {
  stopObserver();

  observer = new MutationObserver((mutations) => {
    const newFields: DetectedField[] = [];
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          newFields.push(...scanNewElements(node));
        }
      }
    }
    if (newFields.length > 0) onNewFields(newFields);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Stop the MutationObserver.
 */
export function stopObserver(): void {
  observer?.disconnect();
  observer = null;
}

/**
 * Look up the DOM element for a given field ID.
 */
export function getElement(fieldId: string): HTMLElement | undefined {
  return elementMap.get(fieldId);
}

/**
 * Reset scanner state (for re-scanning after stop).
 */
export function resetScanner(): void {
  stopObserver();
  fieldCounter = 0;
  elementMap.clear();
}
