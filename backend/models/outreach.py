"""
Pydantic models for Outreach (email generation requests and responses).
"""
from typing import List, Optional
from pydantic import BaseModel


class EmailGenerationRequest(BaseModel):
    company: str
    role: str
    recruiter_email: str
    recruiter_name: Optional[str] = None
    job_description: str
    template_id: Optional[str] = "cold-outreach"
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
