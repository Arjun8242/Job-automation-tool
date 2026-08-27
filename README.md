# AI Job Application Copilot

> **V1 — Cold Email Automation** | Next.js + TypeScript + Tailwind · Python + FastAPI

Automates the repetitive parts of recruiter cold outreach: you paste a JD, the system selects a relevant project + resume, personalises your email template, and creates a Gmail draft. You review and send.

---

## Quick Start

### 1. Clone & install

```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure environment variables

```bash
# Backend
cp backend/.env.example backend/.env
# Fill in: OPENAI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

# Frontend
cp frontend/.env.local.example frontend/.env.local
# NEXT_PUBLIC_API_URL=http://localhost:8000  (default, usually fine)
```

### 3. Add your data

- **Profile**: edit `data/profile.json` with your name, email, links, skills.
- **Projects**: edit `data/projects.json` with your projects.
- **Resumes**: drop PDF files into `data/resumes/` (see naming guide inside).

### 4. Run

```bash
# Terminal 1 — Backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
.
├── data/
│   ├── profile.json          # Your personal info
│   ├── projects.json         # Your projects
│   ├── templates.json        # Cold-email templates
│   └── resumes/              # Resume PDFs (gitignored)
│
├── backend/                  # Python + FastAPI
│   ├── main.py
│   ├── api/                  # Route handlers
│   ├── models/               # Pydantic models
│   ├── services/             # AI + Gmail logic (Phases 3-4)
│   └── utils/
│
└── frontend/                 # Next.js + TypeScript + Tailwind
    └── src/
        ├── app/              # Next.js App Router pages
        ├── lib/api.ts        # Typed API client
        └── types/index.ts    # Shared TypeScript interfaces
```

---

## Development Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 — Setup & Data | ✅ Done | Project scaffold, data files, Pydantic models, TS types |
| 2 — Profile & Template UI | ⬜ Next | Profile editor, project manager, template manager |
| 3 — JD + Email Engine | ⬜ | LLM JD extraction, project/resume selection, email gen |
| 4 — Gmail Integration | ⬜ | OAuth, MIME construction, draft creation |
| 5 — Review UI + Testing | ⬜ | Full workflow polish and E2E testing |

---

## Security Notes

- `.env`, `.credentials/`, `data/resumes/`, and personal JSON files are **gitignored**.
- Gmail OAuth tokens are stored locally in `.credentials/gmail_token.json`.
- The tool never sends emails automatically — all sending is manual.
