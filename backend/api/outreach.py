"""
Outreach API router — email generation pipeline.
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from models.outreach import (
    EmailGenerationRequest,
    GeneratedEmail,
)
from utils.json_store import read_json, list_resumes
from services import ai_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_templates() -> List[dict]:
    try:
        return read_json("templates.json")
    except FileNotFoundError:
        return []


def _load_projects() -> List[dict]:
    try:
        return read_json("projects.json")
    except FileNotFoundError:
        return []


def _load_profile() -> dict:
    try:
        return read_json("profile.json")
    except FileNotFoundError:
        return {}


# ---------------------------------------------------------------------------
# Email Generation
# ---------------------------------------------------------------------------

@router.post("/generate", response_model=GeneratedEmail)
async def generate_email(request: EmailGenerationRequest):
    """
    Full pipeline:
      1. Extract JD essentials
      2. Select projects & resume
      3. Generate email from template + context
      4. Humanize
      5. Validate (guardrail)
    """
    profile = _load_profile()
    projects = _load_projects()
    templates = _load_templates()
    available_resumes = list_resumes()

    # --- Find template ---
    tmpl = next((t for t in templates if t["id"] == request.template_id), None)
    if not tmpl and templates:
        tmpl = templates[0]
    elif not tmpl:
        raise HTTPException(status_code=404, detail="No email templates available.")

    # --- Step 1: Extract JD ---
    try:
        jd_essentials = ai_service.analyze_jd(
            job_description=request.job_description,
            company=request.company,
            role=request.role,
            projects=projects,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"JD extraction failed: {e}")

    # --- Step 2: Select projects ---
    # User override takes priority
    if request.selected_project_id:
        project_ids = [request.selected_project_id]
    else:
        project_ids = jd_essentials.get("recommended_projects", [])

    selected_projects = ai_service.select_projects(
        jd_skills=jd_essentials.get("skills", []),
        jd_keywords=jd_essentials.get("keywords", []),
        projects=projects,
        project_ids=project_ids,
    )

    # --- Step 3: Select resume ---
    if request.selected_resume:
        chosen_resume = request.selected_resume
    else:
        chosen_resume = ai_service.select_resume(
            recommended_tag=jd_essentials.get("recommended_resume"),
            available_resumes=available_resumes,
        )

    # --- Step 4: Generate email ---
    try:
        generated = ai_service.generate_email(
            profile=profile,
            template=tmpl,
            company=request.company,
            role=request.role,
            recruiter_name=request.recruiter_name,
            jd_essentials=jd_essentials,
            selected_projects=selected_projects,
            selected_resume=chosen_resume,
            notes=request.notes,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Email generation failed: {e}")

    # --- Step 5: Humanize ---
    try:
        humanized = ai_service.humanize_email(
            subject=generated["subject"],
            body=generated["body"],
            profile=profile,
            company=request.company,
            role=request.role,
        )
    except Exception:
        # Humanization failure is non-fatal — use raw generated email
        humanized = generated

    # --- Step 6: Validate ---
    validated = ai_service.validate_email(
        subject=humanized["subject"],
        body=humanized["body"],
        profile=profile,
        projects=projects,
    )

    # Build links list
    links_obj = profile.get("links", {})
    links = [v for v in [links_obj.get("portfolio"), links_obj.get("github"), links_obj.get("linkedin")] if v]
    for p in selected_projects:
        if p.get("github"):
            links.append(p["github"])
        if p.get("live"):
            links.append(p["live"])

    return GeneratedEmail(
        subject=validated["subject"],
        body=validated["body"],
        selected_project=selected_projects[0]["id"] if selected_projects else None,
        selected_resume=chosen_resume,
        links=links,
    )
