"""
Pydantic models for Outreach (email generation requests and responses).
"""
from typing import List, Optional
from pydantic import BaseModel


class EmailTemplate(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    subject: str
    body: str


# ---------------------------------------------------------------------------
# JD Extraction
# ---------------------------------------------------------------------------

class JDExtractionRequest(BaseModel):
    company: str
    role: str
    job_description: str
    recruiter_name: Optional[str] = None
    recruiter_email: Optional[str] = None
    job_url: Optional[str] = None
    notes: Optional[str] = None


class JDExtractionResult(BaseModel):
    company: str
    role: str
    location: Optional[str] = None
    skills: List[str] = []
    keywords: List[str] = []
    recommended_projects: List[str] = []
    recommended_resume: Optional[str] = None


# ---------------------------------------------------------------------------
# Email Generation
# ---------------------------------------------------------------------------

class EmailGenerationRequest(BaseModel):
    company: str
    role: str
    recruiter_email: str
    recruiter_name: Optional[str] = None
    job_description: str
    template_id: str
    selected_project_id: Optional[str] = None  # override; None = auto-select
    selected_resume: Optional[str] = None       # override; None = auto-select
    notes: Optional[str] = None


class GeneratedEmail(BaseModel):
    subject: str
    body: str
    selected_project: Optional[str] = None
    selected_resume: Optional[str] = None
    links: List[str] = []


# ---------------------------------------------------------------------------
# Gmail Draft
# ---------------------------------------------------------------------------

class DraftCreationRequest(BaseModel):
    recruiter_email: str
    subject: str
    body: str
    resume_filename: Optional[str] = None


class DraftCreationResult(BaseModel):
    draft_id: str
    draft_url: Optional[str] = None
    message: str
