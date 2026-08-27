// TypeScript interfaces mirroring backend Pydantic models.
// Keep in sync with backend/models/*.py

// ─── Profile ─────────────────────────────────────────────

export interface Education {
  college: string;
  degree: string;
  graduationYear: number;
  cgpa?: number;
}

export interface Links {
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

export interface Experience {
  company: string;
  role: string;
  location?: string;
  startDate: string;
  endDate?: string;
  technologies: string[];
  highlights: string[];
}

export interface Profile {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  education: Education;
  links: Links;
  skills: string[];
  currentlyLearning?: string[];
  experience: Experience[];
  achievements: string[];
}

// ─── Projects ────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string;
  problemSolved?: string;
  technologies: string[];
  architecture?: string;
  highlights: string[];
  userContribution?: string;
  results?: string;
  github?: string;
  live?: string;
  tags: string[];
}

// ─── Outreach ─────────────────────────────────────────────

export interface EmailGenerationRequest {
  company: string;
  role: string;
  recruiter_email: string;
  recruiter_name?: string;
  job_description: string;
  template_id?: string;
  selected_project_id?: string;
  selected_resume?: string;
  notes?: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  selected_project?: string;
  selected_resume?: string;
  links: string[];
}

// ─── Gmail ───────────────────────────────────────────────

export interface DraftCreationRequest {
  recruiter_email: string;
  subject: string;
  body: string;
  resume_filename?: string;
}

export interface DraftCreationResult {
  draft_id: string;
  draft_url?: string;
  message: string;
}

export interface GmailStatus {
  connected: boolean;
  email?: string;
}
