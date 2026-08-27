import { DetectedField, FieldCategory } from "../shared/types";

/**
 * Deterministic field classifier — categorizes form fields using keyword rules.
 * Falls back to UNKNOWN with low confidence for ambiguous fields.
 */

/** A classification rule: regex pattern → category */
interface Rule {
  pattern: RegExp;
  category: FieldCategory;
}

/**
 * Rules are tested against a normalized string built from: label + name + placeholder.
 * Order matters — first match wins within each category group.
 */
const RULES: Rule[] = [
  // CONTACT — check before PERSONAL since "email" and "phone" are unambiguous
  { pattern: /\be[-_]?mail/i, category: FieldCategory.CONTACT },
  { pattern: /\bphone|\bmobile|\btel(?:ephone)?|\bcell/i, category: FieldCategory.CONTACT },

  // SOCIAL_LINK — check before PERSONAL since "linkedin url" shouldn't match "name"
  { pattern: /\blinkedin/i, category: FieldCategory.SOCIAL_LINK },
  { pattern: /\bgithub/i, category: FieldCategory.SOCIAL_LINK },
  { pattern: /\bportfolio/i, category: FieldCategory.SOCIAL_LINK },
  { pattern: /\bleetcode/i, category: FieldCategory.SOCIAL_LINK },
  { pattern: /\bwebsite\b|\bpersonal\s*(?:url|site|link|page)/i, category: FieldCategory.SOCIAL_LINK },
  { pattern: /\btwitter|\bx\.com|\bstack\s*overflow/i, category: FieldCategory.SOCIAL_LINK },

  // EDUCATION
  { pattern: /\bcollege|\buniversity|\bschool|\binstitut/i, category: FieldCategory.EDUCATION },
  { pattern: /\bdegree|\bmajor|\bfield\s*of\s*study/i, category: FieldCategory.EDUCATION },
  { pattern: /\bgraduat|\bgrad\s*year|\bclass\s*of|\byear\s*of\s*(?:grad|completion)/i, category: FieldCategory.EDUCATION },
  { pattern: /\bgpa|\bcgpa/i, category: FieldCategory.EDUCATION },

  // RESUME / FILE UPLOAD
  { pattern: /\bresume|\bcv\b|\bcurriculum/i, category: FieldCategory.RESUME },
  { pattern: /\bcover\s*letter/i, category: FieldCategory.RESUME },

  // SKILL
  { pattern: /\bskills?\b|\btechnolog(?:y|ies)|\bcoding\s*lang/i, category: FieldCategory.SKILL },

  // PERSONAL
  { pattern: /\bfirst\s*name/i, category: FieldCategory.PERSONAL },
  { pattern: /\blast\s*name|\bsurname|\bfamily\s*name/i, category: FieldCategory.PERSONAL },
  { pattern: /\bfull\s*name|\byour\s*name|\bname\b/i, category: FieldCategory.PERSONAL },
  { pattern: /\baddress|\bstreet/i, category: FieldCategory.PERSONAL },
  { pattern: /\bcity|\blocation|\bwhere.*(?:live|based|located)/i, category: FieldCategory.PERSONAL },
  { pattern: /\bstate|\bprovince|\bregion/i, category: FieldCategory.PERSONAL },
  { pattern: /\bzip|\bpostal|\bpin\s*code/i, category: FieldCategory.PERSONAL },
  { pattern: /\bcountry|\bnationality/i, category: FieldCategory.PERSONAL },
  { pattern: /\bgender|\bpronouns/i, category: FieldCategory.PERSONAL },
  { pattern: /\bdate\s*of\s*birth|\bdob\b|\bage\b/i, category: FieldCategory.PERSONAL },
];

/** Patterns that strongly indicate a free-form question needing AI answers */
const QUESTION_PATTERNS = [
  /\bwhy\b.*\b(?:join|work|apply|interest|company|role|team|us)\b/i,
  /\btell\s*(?:us|me)\s*about/i,
  /\bdescribe\b/i,
  /\bexplain\b/i,
  /\bwhat\s*(?:makes|motivates|interests|excites|drives)/i,
  /\bhow\s*(?:did|would|will|do)\s*you/i,
  /\bwhy\s*should\s*we/i,
  /\bcover\s*letter/i,
  /\badditional\s*(?:info|information|comments|notes)/i,
];

/**
 * Build a searchable text from a field's metadata.
 */
function fieldText(field: DetectedField): string {
  return `${field.label} ${field.id} ${field.type}`.toLowerCase();
}

/**
 * Classify a single field using deterministic rules.
 */
function classifyOne(field: DetectedField): { category: FieldCategory; confidence: "high" | "low" } {
  const text = fieldText(field);

  // File inputs are almost always resume uploads
  if (field.type === "file") {
    return { category: FieldCategory.RESUME, confidence: "high" };
  }

  // Type-based shortcuts
  if (field.type === "email") {
    return { category: FieldCategory.CONTACT, confidence: "high" };
  }
  if (field.type === "tel") {
    return { category: FieldCategory.CONTACT, confidence: "high" };
  }
  if (field.type === "url") {
    // Could be social link or portfolio — check label
    for (const rule of RULES) {
      if (rule.category === FieldCategory.SOCIAL_LINK && rule.pattern.test(text)) {
        return { category: FieldCategory.SOCIAL_LINK, confidence: "high" };
      }
    }
    return { category: FieldCategory.SOCIAL_LINK, confidence: "low" };
  }

  // Textarea or long-text → check if it's a question
  if (field.type === "textarea") {
    for (const qp of QUESTION_PATTERNS) {
      if (qp.test(field.label)) {
        return { category: FieldCategory.AI_QUESTION, confidence: "high" };
      }
    }
    // Textarea without a question pattern — likely still a question
    return { category: FieldCategory.AI_QUESTION, confidence: "low" };
  }

  // Check question patterns on any field type (some sites use regular inputs for questions)
  for (const qp of QUESTION_PATTERNS) {
    if (qp.test(field.label)) {
      return { category: FieldCategory.AI_QUESTION, confidence: "high" };
    }
  }

  // Apply keyword rules
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return { category: rule.category, confidence: "high" };
    }
  }

  return { category: FieldCategory.UNKNOWN, confidence: "low" };
}

/**
 * Classify all fields using deterministic rules.
 * Returns the fields with updated `category` and `confidence`.
 * Fields with low confidence or UNKNOWN can be sent to the backend LLM.
 */
export function classifyFields(fields: DetectedField[]): DetectedField[] {
  return fields.map((field) => {
    const { category, confidence } = classifyOne(field);
    return { ...field, category, confidence };
  });
}

/**
 * Return fields that need LLM classification (low confidence or UNKNOWN).
 */
export function getAmbiguousFields(fields: DetectedField[]): DetectedField[] {
  return fields.filter((f) => f.confidence === "low" || f.category === FieldCategory.UNKNOWN);
}
