"""
Gmail API router — OAuth flow + draft creation.
Full implementation backed by services/gmail_service.py.
"""
from fastapi import APIRouter, HTTPException
from models.outreach import DraftCreationRequest, DraftCreationResult
from services.gmail_service import gmail_service
from utils.json_store import resume_path

router = APIRouter()


@router.get("/status")
async def gmail_status():
    """
    Return whether Gmail OAuth credentials are available and valid.
    """
    try:
        status = gmail_service.is_connected()
        return status
    except Exception as e:
        return {"connected": False, "email": None, "error": str(e)}


@router.get("/auth")
async def gmail_auth():
    """
    Initiate Gmail OAuth flow.
    Uses InstalledAppFlow.run_local_server() in a background thread —
    opens a browser tab on the server machine for Google consent.
    Returns the flow status.
    """
    result = gmail_service.get_auth_url()

    if result is None:
        raise HTTPException(
            status_code=500,
            detail="No client_secret_*.json found in backend/.credentials/. "
                   "Download it from Google Cloud Console → APIs & Services → Credentials.",
        )

    if result == "ALREADY_CONNECTED":
        return {
            "status": "already_connected",
            "message": "Gmail is already connected.",
        }

    if result == "AUTH_IN_PROGRESS":
        return {
            "status": "in_progress",
            "message": "OAuth flow is already in progress. Complete it in the browser window that opened.",
        }

    # FLOW_STARTED
    return {
        "status": "flow_started",
        "message": "A browser window has opened for Google sign-in. "
                   "Complete the authorization there, then check status.",
    }


@router.post("/disconnect")
async def gmail_disconnect():
    """Remove stored Gmail credentials."""
    gmail_service.disconnect()
    return {"message": "Gmail disconnected.", "connected": False}


@router.post("/draft", response_model=DraftCreationResult)
async def create_draft(request: DraftCreationRequest):
    """
    Build a MIME email with optional resume PDF attachment
    and insert it as a Gmail draft.
    """
    # Verify connection
    status = gmail_service.is_connected()
    if not status.get("connected"):
        raise HTTPException(
            status_code=401,
            detail="Gmail is not connected. Please authenticate via /api/gmail/auth first.",
        )

    # Resolve resume path
    pdf_path = None
    if request.resume_filename:
        try:
            pdf_path = resume_path(request.resume_filename)
        except ValueError:
            raise HTTPException(
                status_code=404,
                detail=f"Resume file '{request.resume_filename}' not found in data/resumes/.",
            )
        if not pdf_path.is_file():
            raise HTTPException(
                status_code=404,
                detail=f"Resume file '{request.resume_filename}' not found in data/resumes/.",
            )

    try:
        result = gmail_service.create_draft(
            to=request.recruiter_email,
            subject=request.subject,
            body=request.body,
            resume_path=pdf_path,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gmail API error: {e}")

    return DraftCreationResult(
        draft_id=result["draft_id"],
        draft_url=result.get("draft_url"),
        message=result["message"],
    )
