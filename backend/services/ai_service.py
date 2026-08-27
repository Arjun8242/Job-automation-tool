"""
AI Service — Gemini implementation for Phase 3.

Pipeline:
  analyze_jd()      → structured JSON extraction of JD essentials
  select_projects() → LLM-assisted / tag-based project relevance ranking
  select_resume()   → tag-based resume file selection from data/resumes/
  generate_email()  → template + context → personalized draft
  humanize_email()  → controlled tone/naturalness pass
  validate_email()  → fact-check against profile/projects (guardrail)
"""
import json
import os
import re
from typing import Optional
from dotenv import load_dotenv

import google.generativeai as genai

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY, transport="rest")


def _model(temperature: float = 0.3) -> genai.GenerativeModel:
    return genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        generation_config=genai.GenerationConfig(
            temperature=temperature,
            response_mime_type="application/json",
        ),
    )


def _model_text(temperature: float = 0.4) -> genai.GenerativeModel:
    """Plain text model (no JSON mode) — used for humanization."""
    return genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        generation_config=genai.GenerationConfig(temperature=temperature),
    )


def _parse_json(text: str) -> dict:
    """Extract JSON from model response, stripping markdown fences if present."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        text = match.group(1)
    return json.loads(text)


# ---------------------------------------------------------------------------
# 1. analyze_jd
# ---------------------------------------------------------------------------

def analyze_jd(
    job_description: str,
    company: str,
    role: str,
    projects: list[dict],
) -> dict:
    """
    Extract key JD essentials and recommend project(s) + resume tag.

    Returns:
        {
          "company": str,
          "role": str,
          "location": str | None,
          "skills": [str],          # 3-5 core technologies/skills
          "keywords": [str],        # 2-4 domain keywords
          "recommended_projects": [str],   # project IDs from knowledge base
          "recommended_resume": str | None # resume tag: backend, frontend, fullstack, ml, software-engineer
        }
    """
    project_catalog = json.dumps(
        [{"id": p["id"], "name": p["name"], "technologies": p.get("technologies", []), "tags": p.get("tags", [])}
         for p in projects],
        indent=2,
    )

    prompt = f"""You are a JSON extraction assistant. Analyze the job description below and return a single JSON object.

Job description:
---
{job_description}
---

Manual inputs (use as fallback if not found in JD):
  company: {company}
  role: {role}

User's verified project catalog:
{project_catalog}

Return ONLY this JSON (no markdown, no explanation):
{{
  "company": "<company name from JD or manual input>",
  "role": "<job title from JD or manual input>",
  "location": "<city/remote or null>",
  "skills": ["<skill1>", "<skill2>", "<skill3>"],
  "keywords": ["<keyword1>", "<keyword2>"],
  "recommended_projects": ["<project_id_1>"],
  "recommended_resume": "<one of: backend | frontend | fullstack | ml | software-engineer | null>"
}}

Rules:
- skills: extract 3-5 core technologies/skills actually required in the JD
- keywords: 2-4 domain-level terms (e.g. "distributed systems", "REST APIs", "clinical workflows")
- recommended_projects: choose 1-2 project IDs from the catalog that best match the JD stack/domain.
- recommended_resume: pick the single best-fit tag based on JD focus area.
"""

    response = _model(temperature=0.2).generate_content(prompt)
    result = _parse_json(response.text)

    # Ensure company/role are never empty
    result.setdefault("company", company)
    result.setdefault("role", role)
    if not result.get("company"):
        result["company"] = company
    if not result.get("role"):
        result["role"] = role

    return result


# ---------------------------------------------------------------------------
# 2. select_projects
# ---------------------------------------------------------------------------

def select_projects(
    jd_skills: list[str],
    jd_keywords: list[str],
    projects: list[dict],
    project_ids: Optional[list[str]] = None,
) -> list[dict]:
    """
    Return the full project dicts for the recommended project IDs.
    Falls back to tag-based matching if no IDs provided.
    """
    if project_ids:
        matched = [p for p in projects if p["id"] in project_ids]
        if matched:
            return matched[:2]

    # Tag-based fallback
    jd_lower = {s.lower() for s in jd_skills + jd_keywords}
    scored = []
    for p in projects:
        tags = {t.lower() for t in p.get("tags", []) + p.get("technologies", [])}
        score = len(jd_lower & tags)
        if score > 0:
            scored.append((score, p))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in scored[:2]] or (projects[:1] if projects else [])


# ---------------------------------------------------------------------------
# 3. select_resume
# ---------------------------------------------------------------------------

def select_resume(
    recommended_tag: Optional[str],
    available_resumes: list[str],
) -> Optional[str]:
    """
    Pick the best matching resume filename from the available PDFs in data/resumes/.
    Tries exact-tag match, then substring match, then first available.
    """
    if not available_resumes:
        return None

    tag = (recommended_tag or "").lower().strip()

    if tag:
        # Exact match: e.g. tag="backend" matches "backend.pdf"
        for r in available_resumes:
            if r.lower().startswith(tag):
                return r

        # Substring match: tag appears anywhere in filename
        for r in available_resumes:
            if tag in r.lower():
                return r

    # Fallback: prefer software-engineer or fullstack or first available
    for preferred in ["software-engineer.pdf", "fullstack.pdf", "backend.pdf"]:
        for r in available_resumes:
            if preferred in r.lower():
                return r

    return available_resumes[0]


# ---------------------------------------------------------------------------
# 4. generate_email
# ---------------------------------------------------------------------------

def generate_email(
    profile: dict,
    template: dict,
    company: str,
    role: str,
    recruiter_name: Optional[str],
    jd_essentials: dict,
    selected_projects: list[dict],
    selected_resume: Optional[str],
    notes: Optional[str] = None,
) -> dict:
    """
    Generate a personalized cold email from the template + context.
    """
    edu = profile.get("education", {})
    links = profile.get("links", {})
    experience = profile.get("experience", [])
    currently_learning = profile.get("currentlyLearning", [])

    proj_context = ""
    for p in selected_projects:
        highlights_str = "\n    - ".join(p.get("highlights", []))
        proj_context += f"""
Project: {p['name']}
  Description: {p['description']}
  Technologies: {', '.join(p.get('technologies', []))}
  Key highlights:
    - {highlights_str}
  GitHub: {p.get('github', 'N/A')}
  Live: {p.get('live', 'N/A')}
"""

    exp_context = ""
    for e in experience:
        highlights_str = "\n  - ".join(e.get("highlights", []))
        exp_context += f"""
  {e['role']} at {e['company']} ({e.get('startDate', '')} – {e.get('endDate', 'Present')})
  Tech: {', '.join(e.get('technologies', []))}
  - {highlights_str}
"""

    recruiter_greeting = f"Hi {recruiter_name}," if recruiter_name else "Hi Hiring Team,"

    prompt = f"""You are writing a concise, highly tailored cold outreach email for a job application.

STRICT GROUNDING RULES — NEVER VIOLATE:
1. Base the email ONLY on verified facts in the USER PROFILE, WORK EXPERIENCE, and RELEVANT PROJECTS below.
2. NEVER invent experience, skills, metrics, college degrees, or companies.
3. Keep the email concise: 90-140 words, preferably around 100-120 words.
4. Structure the email naturally around:
   - who I am
   - what I do / where I'm good at
   - what I'm currently learning (only if relevant)
   - why I'm contacting the recruiter
   - one relevant project or experience
   - resume + links
   - a concise call to action
5. Mention only 2-4 relevant skills rather than dumping the entire skill list.
6. Mention at most ONE relevant project or work experience unless two are genuinely necessary.
7. Mention current learning only when relevant to the role. Present it as ongoing learning, never as existing professional expertise.
8. First-person, confident, professional, and natural human tone.
9. Avoid clichéd openers like "I hope this email finds you well" or "I am writing to express my eager interest".
10. Start the body with the exact greeting provided.
11. Replace all placeholder variables with actual values. Never return bracketed placeholders.

--- REQUIRED EMAIL STRUCTURE ---

The email should answer these questions in order:

1. Who am I?
   Briefly introduce me and what I currently do.

2. What do I do / where am I good at?
   Mention the most relevant skills for this role.

3. What am I currently learning?
   Mention this only if it is relevant to the role.

4. Why am I contacting you?
   Clearly mention the specific role and company.

5. Why am I relevant?
   Mention ONE relevant project or work experience as evidence.

6. What do I want?
   Ask the recruiter to consider my profile for the opportunity
   and mention that my resume is attached.

7. Where can they learn more?
   Include my verified Portfolio, GitHub and LinkedIn.

Do not turn this into a cover letter.
Keep it concise and conversational.

--- EMAIL TEMPLATE GUIDE ---
Template: {template['name']}
Subject format: {template['subject']}
Body structure:
{template['body']}

--- USER PROFILE (VERIFIED) ---
Name: {profile['name']}
Email: {profile['email']}
Phone: {profile.get('phone', 'N/A')}
Location: {profile.get('location', 'N/A')}
Education: {edu.get('degree', '')} at {edu.get('college', '')}, graduating {edu.get('graduationYear', '')} (CGPA: {edu.get('cgpa', 'N/A')})
Skills: {', '.join(profile.get('skills', []))}
Currently learning: {', '.join(currently_learning)}
Links:
  LinkedIn: {links.get('linkedin', 'N/A')}
  GitHub: {links.get('github', 'N/A')}
  Portfolio: {links.get('portfolio', 'N/A')}
Achievements: {'; '.join(profile.get('achievements', []))}

--- WORK EXPERIENCE ---
{exp_context or 'None'}

--- SELECTED RELEVANT PROJECTS ---
{proj_context or 'None'}

--- TARGET ROLE CONTEXT ---
Company: {company}
Role: {role}
Key skills extracted from JD: {', '.join(jd_essentials.get('skills', []))}
Domain keywords: {', '.join(jd_essentials.get('keywords', []))}

--- GREETING TO USE ---
{recruiter_greeting}

--- USER NOTES ---
{notes or 'None'}

Return ONLY this JSON:
{{
  "subject": "<subject line>",
  "body": "<plain text email body starting with greeting>"
}}
"""

    response = _model(temperature=0.45).generate_content(prompt)
    result = _parse_json(response.text)
    return result


# ---------------------------------------------------------------------------
# 5. humanize_email
# ---------------------------------------------------------------------------

def humanize_email(
    subject: str,
    body: str,
    profile: dict,
    company: str,
    role: str,
) -> dict:
    """
    Controlled tone polish: remove AI clichés, keep all facts intact.
    """
    prompt = f"""You are a professional email editor. Polish this cold job application email to sound completely natural, concise, and human.

RULES:
1. Preserve all factual claims, metrics, project names, and links exactly.
2. Remove robot-like phrases (e.g. "I am confident that", "thrilled to apply", "synergy", "seamlessly").
3. Ensure natural email flow without unnecessary filler.
4. Keep it concise.

--- CURRENT EMAIL ---
Subject: {subject}

{body}
---

Return ONLY:
SUBJECT: <subject line>
---
<body>"""

    response = _model_text(temperature=0.3).generate_content(prompt)
    text = response.text.strip()

    if "---" in text:
        parts = text.split("---", 1)
        subj_line = parts[0].replace("SUBJECT:", "").strip()
        body_text = parts[1].strip()
    else:
        subj_line = subject
        body_text = text

    return {
        "subject": subj_line if subj_line else subject,
        "body": body_text if body_text else body,
    }


# ---------------------------------------------------------------------------
# 6. validate_email
# ---------------------------------------------------------------------------

def validate_email(
    subject: str,
    body: str,
    profile: dict,
    projects: list[dict],
) -> dict:
    """
    Lightweight fact-check guardrail.
    """
    warnings = []
    known_skills = {s.lower() for s in profile.get("skills", [])}
    body_lower = body.lower()

    for placeholder in ["[your name]", "[link]", "[company]", "[insert", "{{", "}}"]:
        if placeholder in body_lower:
            warnings.append(f"Unfilled placeholder detected: '{placeholder}'")

    SUSPICIOUS_TECH = ["kubernetes", "kafka", "spark", "tensorflow", "pytorch", "rust", "golang", "scala"]
    for tech in SUSPICIOUS_TECH:
        if tech in body_lower and tech not in known_skills:
            warnings.append(f"Tech '{tech}' mentioned in email but not in verified skills.")

    return {
        "valid": len(warnings) == 0,
        "warnings": warnings,
        "subject": subject,
        "body": body,
    }
