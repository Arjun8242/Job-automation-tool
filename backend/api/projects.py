"""
Projects API router — CRUD on data/projects.json
"""
from typing import List
from fastapi import APIRouter, HTTPException
from models.project import Project
from utils.json_store import read_json, write_json

router = APIRouter()


def _load() -> List[dict]:
    try:
        return read_json("projects.json")
    except FileNotFoundError:
        return []


@router.get("/", response_model=List[Project])
async def list_projects():
    """Return all projects."""
    return [Project(**p) for p in _load()]


@router.post("/", response_model=Project, status_code=201)
async def create_project(project: Project):
    """Add a new project."""
    projects = _load()
    if any(p["id"] == project.id for p in projects):
        raise HTTPException(status_code=409, detail=f"Project with id '{project.id}' already exists.")
    projects.append(project.model_dump())
    write_json("projects.json", projects)
    return project


@router.put("/{project_id}", response_model=Project)
async def update_project(project_id: str, project: Project):
    """Update an existing project by id."""
    projects = _load()
    idx = next((i for i, p in enumerate(projects) if p["id"] == project_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")
    projects[idx] = project.model_dump()
    write_json("projects.json", projects)
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str):
    """Delete a project by id."""
    projects = _load()
    filtered = [p for p in projects if p["id"] != project_id]
    if len(filtered) == len(projects):
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")
    write_json("projects.json", filtered)
