import { DetectedField, FieldCategory } from "../shared/types";

/**
 * DOM Form Scanner — detects form fields on the current page.
 * Extracts labels, types, required status, and existing values.
 */

/** Elements we've already scanned (prevents duplicates on re-scan / MutationObserver) */
let scannedElements = new WeakSet<Element>();

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
 * Clean dynamic UI clutter, autocomplete messages, and status hints from extracted labels.
 */
function cleanLabelText(text: string): string {
  if (!text) return "";
  let cleaned = text
    .replace(/no location found\.?/gi, "")
    .replace(/try entering a different location\.?/gi, "")
    .replace(/loading\.{0,3}/gi, "")
    .replace(/select (?:an|a) (?:option|value)\.{0,3}/gi, "")
    .replace(/type to search\.{0,3}/gi, "")
    .replace(/\b(?:required|optional)\b/gi, "")
    .replace(/[*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // If label is just a random UUID/hash like "cards c3ffff75 d9aa..." return empty so fallback searches parents
  if (/^[a-f0-9_\-\s]{20,}$/i.test(cleaned) || /cards[\s_-]+[a-f0-9]{8}/i.test(cleaned)) {
    return "";
  }

  return cleaned;
}

/**
 * Resolve the best human-readable label text for a form element.
 * Priority:
 * 1. <label for="id">
 * 2. Parent <label>
 * 3. Enclosing question/field container headers (legend, .label, [class*='question'], [class*='title'])
 * 4. aria-label / aria-labelledby
 * 5. Preceding sibling labels/headings
 * 6. placeholder
 * 7. name attribute (if readable)
 */
function resolveLabel(el: HTMLElement): string {
  // 1. <label for="id">
  if (el.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (label?.textContent) {
      const text = cleanLabelText(label.textContent);
      if (text) return text;
    }
  }

  // 2. Parent <label>
  const parentLabel = el.closest("label");
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, textarea, select, ul, [role='listbox']").forEach((c) => c.remove());
    const text = cleanLabelText(clone.textContent || "");
    if (text) return text;
  }

  // 3. Parent container (Greenhouse cards, Ashby questions, Lever groups, form-groups)
  const container = el.closest(
    ".field, .form-group, .form-field, .question, [class*='field'], [class*='question'], [class*='card'], [class*='form-row'], fieldset, [data-testid*='question'], [data-testid*='field']"
  );
  if (container) {
    // Check for legend
    const legend = container.querySelector("legend");
    if (legend?.textContent) {
      const text = cleanLabelText(legend.textContent);
      if (text) return text;
    }

    // Check for label / title / prompt sub-elements inside container
    const headerEl = container.querySelector(
      "label, .label, [class*='label'], [class*='title'], [class*='prompt'], [class*='header'], [class*='name'], h3, h4, h5, p, span, strong, b"
    );
    if (headerEl && headerEl !== el && !headerEl.contains(el)) {
      const text = cleanLabelText(headerEl.textContent || "");
      if (text && text.length > 1 && text.length < 200) return text;
    }
  }

  // 4. Preceding sibling label or text element
  let prev = el.previousElementSibling;
  while (prev) {
    if (prev.matches("label, .label, [class*='label'], [class*='title'], h3, h4, h5, p, span, strong, b, legend")) {
      const text = cleanLabelText(prev.textContent || "");
      if (text && text.length < 150) return text;
    }
    prev = prev.previousElementSibling;
  }

  // 5. aria-label
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    const text = cleanLabelText(ariaLabel);
    if (text) return text;
  }

  // 6. aria-labelledby
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent)
      .filter(Boolean);
    if (parts.length) {
      const text = cleanLabelText(parts.join(" "));
      if (text) return text;
    }
  }

  // 7. placeholder
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.placeholder) {
      const text = cleanLabelText(el.placeholder);
      if (text) return text;
    }
  }

  // 8. For file inputs: check closest container / dropzone text
  if (el instanceof HTMLInputElement && el.type === "file") {
    const fileContainer = el.closest(
      "[class*='resume'], [class*='cv'], [class*='upload'], [class*='file'], [class*='drop'], [data-testid*='resume'], [data-testid*='upload'], .dropzone"
    );
    if (fileContainer) {
      const containerText = cleanLabelText(fileContainer.textContent || "");
      if (containerText && containerText.length < 100) {
        return containerText;
      }
    }
    return "Resume / CV";
  }

  // 9. name attribute (if readable and not a random hash)
  const name = el.getAttribute("name");
  if (name) {
    const cleaned = cleanLabelText(
      name.replace(/[_\-\[\]]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2")
    );
    if (cleaned) return cleaned;
  }

  return "";
}

/**
 * Get the current value of a form element.
 */
function getValue(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  if (el instanceof HTMLSelectElement) return el.value;
  return "";
}

function getOptions(el: HTMLElement): string[] {
  if (!(el instanceof HTMLSelectElement)) return [];
  return Array.from(el.options)
    .map((option) => option.text.trim())
    .filter(Boolean);
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
  // File inputs are frequently visually hidden behind styled upload buttons/dropzones
  if (type !== "file" && !isVisible(el)) return null;

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
    options: getOptions(el),
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
  scannedElements = new WeakSet<Element>();
  elementMap.clear();
}
