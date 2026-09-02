"""
Pydantic models for the User Profile.
Includes currentlyLearning, experience, and achievements.
"""
from typing import List, Optional
from pydantic import BaseModel


class Education(BaseModel):
    college: str
    degree: str
    graduationYear: int
    cgpa: Optional[float] = None


class Links(BaseModel):
    linkedin: Optional[str] = None
    github: Optional[str] = None
    portfolio: Optional[str] = None
    leetcode: Optional[str] = None


class Experience(BaseModel):
    company: str
    role: str
    location: Optional[str] = None
    startDate: str
    endDate: Optional[str] = None
    technologies: List[str] = []
    highlights: List[str] = []


class Profile(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    location: Optional[str] = None
    currentCity: Optional[str] = None
    currentAddress: Optional[str] = None
    noticePeriod: Optional[str] = "Immediate"
    noticePeriodDays: Optional[int] = 0
    education: Education
    links: Links
    skills: List[str] = []
    currentlyLearning: List[str] = []
    experience: List[Experience] = []
    achievements: List[str] = []
