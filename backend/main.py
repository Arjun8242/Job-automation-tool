from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import profile, projects, outreach, gmail, resumes

app = FastAPI(
    title="AI Job Application Copilot API",
    description="Backend API for the AI Job Application Copilot — cold email automation tool.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(profile.router, prefix="/api/profile", tags=["Profile"])
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
app.include_router(outreach.router, prefix="/api/outreach", tags=["Outreach"])
app.include_router(gmail.router, prefix="/api/gmail", tags=["Gmail"])
app.include_router(resumes.router, prefix="/api/resumes", tags=["Resumes"])


@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "message": "AI Job Application Copilot API is running."}


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}
