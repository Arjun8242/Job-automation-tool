"""
Pydantic models for Projects.
"""
from typing import List, Optional
from pydantic import BaseModel


class Project(BaseModel):
    id: str
    name: str
    description: str
    problemSolved: Optional[str] = None
    technologies: List[str] = []
    architecture: Optional[str] = None
    highlights: List[str] = []
    userContribution: Optional[str] = None
    results: Optional[str] = None
    github: Optional[str] = None
    live: Optional[str] = None
    tags: List[str] = []
