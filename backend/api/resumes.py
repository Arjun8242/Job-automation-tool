"""
Resumes API router — list local PDF resumes for the selector dropdown.
"""
from typing import List
from fastapi import APIRouter
from utils.json_store import list_resumes

router = APIRouter()


@router.get("/", response_model=List[str])
async def get_resumes():
    """Return filenames of all PDFs found in data/resumes/."""
    return list_resumes()
