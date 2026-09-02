"""
Resumes API router — list local PDF resumes for the selector dropdown.
"""
from typing import List
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from utils.json_store import list_resumes, resume_path

router = APIRouter()


@router.get("/", response_model=List[str])
async def get_resumes():
    """Return filenames of all PDFs found in data/resumes/."""
    return list_resumes()


@router.get("/file/{filename}")
async def get_resume_file(filename: str):
    """Return the raw PDF file for the specified resume."""
    try:
        path = resume_path(filename)
    except ValueError:
        raise HTTPException(status_code=404, detail="Resume PDF not found.")

    if not path.is_file():
        raise HTTPException(status_code=404, detail="Resume PDF not found.")
    return FileResponse(
        path=path,
        media_type="application/pdf",
        filename=path.name,
    )
