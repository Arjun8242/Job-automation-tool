import { DetectedField, FieldCategory, FillResult } from "../shared/types";
import { getElement } from "./scanner";

/**
 * Filler — maps classified fields to profile data and fills DOM elements.
 * Only fills high-confidence matches. Does not overwrite non-empty fields.
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
 * Resolve the profile value for a field based on its category and label.
 */
function resolveProfileValue(field: DetectedField, profile: Profile): string | null {
  const label = field.label.toLowerCase();

  switch (field.category) {
    case FieldCategory.PERSONAL: {
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
        return profile.location || null;
      }
      if (/\baddress/i.test(label)) {
        return profile.currentAddress || profile.location || null;
      }
      if (/\bcountry/i.test(label)) {
        // Extract country from location "Noida, India" → "India"
        const loc = profile.location || "";
        const parts = loc.split(",").map((s: string) => s.trim());
        return parts.length > 1 ? parts[parts.length - 1] : null;
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
      if (/\bleetcode/i.test(label)) return links.leetcode || null;
      // Generic URL field — try portfolio
      if (field.type === "url") return links.portfolio || null;
      return null;
    }

    case FieldCategory.SKILL: {
      const skills = profile.skills || [];
      return skills.length > 0 ? skills.join(", ") : null;
    }

    // RESUME, AI_QUESTION, UNKNOWN — not auto-filled
    default:
      return null;
  }
}

/**
 * Set a value on a form element and dispatch events for framework compatibility.
 * Uses the native setter to work with React/Vue/Angular controlled inputs.
 */
function setFieldValue(el: HTMLElement, value: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    // Use native setter to bypass React's synthetic event system
    const proto = el instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }
  } else if (el instanceof HTMLSelectElement) {
    el.value = value;
  }

  // Dispatch events in the order frameworks expect
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
    // Skip non-fillable categories
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

    // Don't overwrite non-empty fields
    const currentValue = (el as HTMLInputElement).value || "";
    if (currentValue.trim()) {
      return { fieldId: field.id, filled: false, value: currentValue, skipped: "non-empty" };
    }

    // Resolve the value from profile
    const profileValue = resolveProfileValue(field, profile);
    if (!profileValue) {
      return { fieldId: field.id, filled: false, value: "", skipped: "no-profile-match" };
    }

    // Fill the field
    setFieldValue(el, profileValue);
    el.classList.add(FILLED_CLASS);

    return { fieldId: field.id, filled: true, value: profileValue };
  });
}
