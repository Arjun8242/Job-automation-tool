import { DetectedField, FieldCategory, FillResult } from "../shared/types";
import { getElement } from "./scanner";

/**
 * Filler — maps classified fields to profile data, fills DOM elements,
 * selects dropdown options, handles autocomplete location widgets,
 * and attaches resumes via DataTransfer.
 * Dispatches events for React/Vue/Angular compatibility.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Profile = Record<string, any>;

/** CSS class applied to fields filled by the extension */
const FILLED_CLASS = "ai-copilot-filled";

/** Inject highlight styles once */
let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .${FILLED_CLASS} {
      outline: 2px solid #6366f1 !important;
      outline-offset: 1px;
      transition: outline-color 0.3s;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Set a value on a <select> element using prototype setter and proper event dispatch.
 */
function setSelectValue(selectEl: HTMLSelectElement, index: number, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(selectEl, value);
  } else {
    selectEl.value = value;
  }
  selectEl.selectedIndex = index;

  selectEl.dispatchEvent(new Event("input", { bubbles: true }));
  selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  selectEl.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
}

/**
 * Try to select the best matching option in a <select> element.
 */
function matchSelectOption(selectEl: HTMLSelectElement, target: string): boolean {
  const targetLower = target.toLowerCase().trim();
  const options = Array.from(selectEl.options);

  // Synonyms for immediate availability / 0 days
  const isImmediate = /immediate|0\s*days?|available\s*now|join\s*immediately/i.test(targetLower);
  const immediateKeywords = [
    "immediate",
    "0 day",
    "0-15",
    "0 to 15",
    "available now",
    "immediately",
    "immediate joiner",
    "less than 15",
    "now",
    "0",
  ];

  // Pass 1: exact keyword match
  for (let i = 0; i < options.length; i++) {
    const optText = options[i].text.toLowerCase().trim();
    const optVal = options[i].value.toLowerCase().trim();

    if (!optVal && !optText) continue; // Skip blank placeholder "Select..."
    if (/^select|^choose|^none|^placeholder/i.test(optText)) continue;

    if (isImmediate) {
      if (immediateKeywords.some((kw) => optText.includes(kw) || optVal === kw)) {
        setSelectValue(selectEl, i, options[i].value);
        return true;
      }
    }

    if (optText === targetLower || optVal === targetLower) {
      setSelectValue(selectEl, i, options[i].value);
      return true;
    }
  }

  // Pass 2: substring match
  for (let i = 0; i < options.length; i++) {
    const optText = options[i].text.toLowerCase().trim();
    const optVal = options[i].value.toLowerCase().trim();

    if (!optVal && !optText) continue;
    if (/^select|^choose|^none|^placeholder/i.test(optText)) continue;

    if (optText.includes(targetLower) || targetLower.includes(optText)) {
      setSelectValue(selectEl, i, options[i].value);
      return true;
    }
  }

  return false;
}

/**
 * Resolve the profile value for a field based on its category, label, and DOM type.
 */
function resolveProfileValue(field: DetectedField, profile: Profile): string | null {
  const label = field.label.toLowerCase();

  switch (field.category) {
    case FieldCategory.PERSONAL: {
      // Current company / Employer -> fill "N/A" as requested
      if (/\b(?:current\s*)?(?:company|employer|organization)\b/i.test(label)) {
        return "N/A";
      }
      // Notice period / Availability
      if (/\bnotice\s*(?:period)?|\bavailab|\bhow\s*soon|\bjoin(?:ing)?\s*(?:time|date|period)|\bstart\s*(?:date|timing|time|immediately)|\bearliest\s*start|\bwhen\s*can\s*you\s*start/i.test(label)) {
        return "Immediate";
      }
      if (/\bfirst\s*name/i.test(label)) {
        const name = profile.name || "";
        return name.split(" ")[0] || null;
      }
      if (/\blast\s*name|\bsurname|\bfamily/i.test(label)) {
        const name = profile.name || "";
        const parts = name.split(" ");
        return parts.length > 1 ? parts.slice(1).join(" ") : null;
      }
      if (/\bfull\s*name|\byour\s*name|\bname\b/i.test(label)) {
        return profile.name || null;
      }
      if (/\bcity|\blocation|\bwhere/i.test(label)) {
        return "Noida";
      }
      if (/\bstate|\bprovince|\bregion/i.test(label)) {
        return profile.location?.split(",")[1]?.trim() || null;
      }
      if (/\bcountry/i.test(label)) {
        return profile.location?.split(",").pop()?.trim() || null;
      }
      if (/\baddress/i.test(label)) {
        return profile.currentAddress || profile.location || null;
      }
      return null;
    }

    case FieldCategory.CONTACT: {
      if (/\be[-_]?mail/i.test(label) || field.type === "email") {
        return profile.email || null;
      }
      if (/\bphone|\bmobile|\btel|\bcell/i.test(label) || field.type === "tel") {
        return profile.phone || null;
      }
      return null;
    }

    case FieldCategory.EDUCATION: {
      const edu = profile.education || {};
      if (/\bcollege|\buniversity|\bschool|\binstitut/i.test(label)) {
        return edu.college || null;
      }
      if (/\bdegree|\bmajor|\bfield\s*of\s*study/i.test(label)) {
        return edu.degree || null;
      }
      if (/\bgraduat|\byear|\bclass\s*of/i.test(label)) {
        return edu.graduationYear ? String(edu.graduationYear) : null;
      }
      if (/\bgpa|\bcgpa/i.test(label)) {
        return edu.cgpa ? String(edu.cgpa) : null;
      }
      return null;
    }

    case FieldCategory.SOCIAL_LINK: {
      const links = profile.links || {};
      if (/\blinkedin/i.test(label)) return links.linkedin || null;
      if (/\bgithub/i.test(label)) return links.github || null;
      if (/\bportfolio|\bwebsite|\bpersonal.*(?:site|page)/i.test(label)) return links.portfolio || null;
      if (/\bleetcode/i.test(label)) return links.leetcode || "https://leetcode.com/u/Arjun8242/";
      if (field.type === "url") return links.portfolio || null;
      return null;
    }

    case FieldCategory.SKILL: {
      const skills = profile.skills || [];
      return skills.length > 0 ? skills.join(", ") : null;
    }

    default:
      return null;
  }
}

/**
 * Handle location / autocomplete search inputs (like Greenhouse / Lever / Google Places).
 * Types the location, triggers search events, and auto-clicks the first suggestion if a dropdown appears.
 */
function fillLocationField(input: HTMLInputElement, value: string): void {
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));

  // Autocomplete widgets render their options asynchronously. Select a matching option if one appears.
  let attempts = 0;
  const selectSuggestion = () => {
    const suggestions = Array.from(document.querySelectorAll<HTMLElement>(
      "[role='option'], .suggestion, [class*='suggestion'], [class*='dropdown-item'], .pac-item"
    ));
    const wanted = value.toLowerCase();
    const match = suggestions.find((option) => {
      const text = option.textContent?.trim().toLowerCase() || "";
      return option.offsetParent !== null && (text === wanted || text.includes(wanted));
    });

    if (match) {
      match.click();
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      return;
    }

    attempts += 1;
    if (attempts < 10) {
      setTimeout(selectSuggestion, 150);
    } else {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    }
  };

  setTimeout(selectSuggestion, 150);
}

/**
 * Set a value on an input element and dispatch events for React/Vue/Angular compatibility.
 */
function setFieldValue(el: HTMLElement, value: string): void {
  if (el instanceof HTMLSelectElement) {
    const matched = matchSelectOption(el, value);
    if (!matched) {
      setSelectValue(el, el.selectedIndex, value);
    }
    return;
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }
  }

  // Dispatch events in standard framework order
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
}

/**
 * Fill all eligible fields with profile data.
 * Returns a list of FillResults describing what happened to each field.
 */
export function fillFields(fields: DetectedField[], profile: Profile): FillResult[] {
  injectStyles();

  return fields.map((field) => {
    // Skip non-text fillable categories
    if (
      field.category === FieldCategory.AI_QUESTION ||
      field.category === FieldCategory.RESUME ||
      field.category === FieldCategory.UNKNOWN
    ) {
      return { fieldId: field.id, filled: false, value: "", skipped: "not-fillable" };
    }

    // Skip low-confidence classifications
    if (field.confidence === "low") {
      return { fieldId: field.id, filled: false, value: "", skipped: "low-confidence" };
    }

    // Find the DOM element
    const el = getElement(field.id);
    if (!el) {
      return { fieldId: field.id, filled: false, value: "", skipped: "element-not-found" };
    }

    // Don't overwrite non-empty fields (except default select placeholders)
    if (el instanceof HTMLSelectElement) {
      const selectedOpt = el.options[el.selectedIndex];
      const optText = selectedOpt?.text?.toLowerCase() || "";
      const optVal = selectedOpt?.value?.toLowerCase() || "";
      const isPlaceholder = !optVal || /select|choose|please|none|--/i.test(optText) || /select|choose|none/i.test(optVal);
      if (!isPlaceholder && el.value.trim()) {
        return { fieldId: field.id, filled: false, value: el.value, skipped: "non-empty" };
      }
    } else {
      const currentValue = (el as HTMLInputElement).value || "";
      if (currentValue.trim()) {
        return { fieldId: field.id, filled: false, value: currentValue, skipped: "non-empty" };
      }
    }

    // Resolve the value from profile
    const profileValue = resolveProfileValue(field, profile);
    if (!profileValue) {
      return { fieldId: field.id, filled: false, value: "", skipped: "no-profile-match" };
    }

    // Handle location autocomplete fields vs standard inputs
    const isLocation =
      /\b(?:location|city|address|where)\b/i.test(field.label) ||
      el.getAttribute("role") === "combobox" ||
      el.getAttribute("aria-autocomplete") === "list" ||
      el.classList.toString().toLowerCase().includes("location");

    if (isLocation && el instanceof HTMLInputElement) {
      fillLocationField(el, profileValue);
    } else {
      setFieldValue(el, profileValue);
    }

    el.classList.add(FILLED_CLASS);

    return { fieldId: field.id, filled: true, value: profileValue };
  });
}

/**
 * Programmatically attach a resume file to an <input type="file"> element using DataTransfer.
 * Dispatches input, change, and drop events on the input and its upload container.
 */
export function attachResumeToInput(fieldId: string, fileBytes: ArrayBuffer, filename: string): boolean {
  injectStyles();

  let targetInput: HTMLInputElement | null = null;

  const el = getElement(fieldId);
  if (el instanceof HTMLInputElement && el.type === "file") {
    targetInput = el;
  } else {
    // Fallback: search for any file input on the page (even if visually hidden)
    const fileInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    targetInput = fileInputs.find((i) => !i.disabled) || null;
  }

  if (!targetInput) {
    return false;
  }

  try {
    const blob = new Blob([fileBytes], { type: "application/pdf" });
    const file = new File([blob], filename, { type: "application/pdf", lastModified: Date.now() });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    targetInput.files = dataTransfer.files;

    // Dispatch events on the file input
    targetInput.dispatchEvent(new Event("input", { bubbles: true }));
    targetInput.dispatchEvent(new Event("change", { bubbles: true }));

    // Also dispatch drop and change on parent containers / dropzones if present
    const dropzone = targetInput.closest(".dropzone, [class*='upload'], [class*='drop'], [class*='resume'], [data-testid*='upload'], form");
    if (dropzone && dropzone !== targetInput) {
      try {
        dropzone.dispatchEvent(new DragEvent("drop", { dataTransfer, bubbles: true }));
        dropzone.dispatchEvent(new Event("change", { bubbles: true }));
        (dropzone as HTMLElement).classList.add(FILLED_CLASS);
      } catch {
        // Ignore synthetic drag event restrictions on some strict pages
      }
    }

    targetInput.classList.add(FILLED_CLASS);
    return true;
  } catch (err) {
    console.error("[AI Job Copilot] Error attaching resume:", err);
    return false;
  }
}
