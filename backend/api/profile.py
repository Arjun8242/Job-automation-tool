"""
Profile API router — GET and PUT /api/profile
"""
from fastapi import APIRouter, HTTPException
from models.profile import Profile
from utils.json_store import read_json, write_json

router = APIRouter()


@router.get("/", response_model=Profile)
async def get_profile():
    """Return the user's profile from data/profile.json."""
    try:
        data = read_json("profile.json")
        return Profile(**data)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="profile.json not found.")


@router.put("/", response_model=Profile)
async def update_profile(profile: Profile):
    """Update the user's profile and persist to data/profile.json."""
    write_json("profile.json", profile.model_dump())
    return profile
