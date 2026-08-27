/** Field categories for classification (Phase 4 will use these) */
export enum FieldCategory {
  PERSONAL = "PERSONAL",
  CONTACT = "CONTACT",
  EDUCATION = "EDUCATION",
  SOCIAL_LINK = "SOCIAL_LINK",
  SKILL = "SKILL",
  RESUME = "RESUME",
  AI_QUESTION = "AI_QUESTION",
  UNKNOWN = "UNKNOWN",
}

/** A form field detected by the DOM scanner */
export interface DetectedField {
  id: string;
  label: string;
  type: string;
  required: boolean;
  value: string;
  category: FieldCategory;
  confidence: "high" | "low";
}

/** Analysis lifecycle states */
export enum AnalysisStatus {
  IDLE = "IDLE",
  ANALYZING = "ANALYZING",
  COMPLETE = "COMPLETE",
  ERROR = "ERROR",
}

/** Message types for extension component communication */
export enum MessageType {
  // Phase 2 — activation
  ANALYZE_PAGE = "ANALYZE_PAGE",
  STOP_ANALYSIS = "STOP_ANALYSIS",
  STATUS_UPDATE = "STATUS_UPDATE",
  // Phase 3+ — scanning & filling
  SCAN_PAGE = "SCAN_PAGE",
  FORM_DETECTED = "FORM_DETECTED",
  CLASSIFY_FIELDS = "CLASSIFY_FIELDS",
  FILL_FIELDS = "FILL_FIELDS",
  GENERATE_ANSWER = "GENERATE_ANSWER",
  ANSWER_READY = "ANSWER_READY",
  FIELD_FILLED = "FIELD_FILLED",
  UNKNOWN_FIELD = "UNKNOWN_FIELD",
  ERROR = "ERROR",
  OPEN_SIDE_PANEL = "OPEN_SIDE_PANEL",
}

/** Typed message envelope for all extension communication */
export interface ExtensionMessage<T = unknown> {
  type: MessageType;
  payload: T;
  tabId?: number;
}
