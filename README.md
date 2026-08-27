# AI Job Application Copilot

> **Cold Email Automation** | Next.js + TypeScript · Python + FastAPI + Google Gemini

An automated recruiter outreach tool designed to eliminate repetitive application workflows. Paste a job description, and the copilot extracts key requirements, selects the most relevant project and resume from your verified knowledge base, personalises the outreach email using Google Gemini (with strict fact grounding), and inserts a rich draft directly into your Gmail account with clickable portfolio/GitHub/LinkedIn links and your resume attached.

---

## Features

- **⚡ Instant Cold Email Generation**: Paste any Job Description (JD) to automatically match against your projects and generate a concise, tailored email.
- **🛡️ Strict Fact Grounding**: The AI is strictly bounded to verified facts from your personal profile and projects (`data/profile.json` & `data/projects.json`).
- **✉️ Direct Gmail Draft Integration**: Connects via Google OAuth 2.0 and generates rich MIME drafts directly in your Gmail drafts folder.
- **🔗 Clickable Hyperlinks**: Automatically converts portfolio, GitHub, LinkedIn, and project URLs into styled clickable links in the Gmail composer.
- **📎 Resume Matching & Auto-Attachment**: Automatically picks the best-fitting resume tag based on the JD stack and attaches the PDF to the Gmail draft.
- **🖤 Minimalist Monochrome UI**: Clean, distraction-free black and white interface.

---

## Quick Start

### 1. Clone & Install Dependencies

```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
python -m venv venv

# Activate Virtualenv
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# macOS / Linux:
source venv/bin/activate

# Install Python requirements
pip install -r requirements.txt
```

### 2. Configure Environment Variables

#### Backend (`backend/.env`)
Create `backend/.env` (or copy from `backend/.env.example`):

```env
GEMINI_API_KEY=your_google_gemini_api_key
GEMINI_MODEL=gemini-3.6-flash
```

#### Google OAuth Credentials (Gmail API)
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**.
2. Enable the **Gmail API** and create an **OAuth 2.0 Client ID** (Desktop Application).
3. Download the client secret JSON file and place it in:
   ```
   backend/.credentials/client_secret_xxxx.json
   ```

### 3. Add Your Personal Data

- **Profile**: Edit `data/profile.json` with your details, skills, experience, and links (Portfolio, GitHub, LinkedIn).
- **Projects**: Edit `data/projects.json` with your project portfolio, technologies, and achievements.
- **Resumes**: Place your resume PDF files in `data/resumes/` (e.g. `software-engineer.pdf`, `backend.pdf`, `fullstack.pdf`).

### 4. Run the Application

```bash
# Terminal 1 — Backend (FastAPI)
cd backend
python -m uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend (Next.js)
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Application Workflow

```
1. Paste Job Description (JD) & Recruiter Info
                  ↓
2. Gemini AI analyzes JD & matches relevant project + resume
                  ↓
3. Tailored email generated & humanized (fact-grounded)
                  ↓
4. Review & edit subject / body
                  ↓
5. Click "Create Gmail Draft" → Draft created in Gmail with resume attached & clickable links
```

---

## Project Structure

```
.
├── data/
│   ├── profile.json          # Verified user profile, skills, and links
│   ├── projects.json         # Verified project catalog
│   ├── templates.json        # Base email template structure
│   └── resumes/              # Resume PDFs (gitignored)
│
├── backend/                  # Python + FastAPI backend
│   ├── main.py               # FastAPI entrypoint & CORS setup
│   ├── api/                  # API routers (outreach, gmail, profile, projects, resumes)
│   ├── models/               # Pydantic data schemas
│   ├── services/
│   │   ├── ai_service.py     # Gemini AI JD analysis & grounded email generation
│   │   └── gmail_service.py  # OAuth 2.0 flow & rich MIME draft creation
│   └── utils/
│       └── json_store.py     # Data file loader utilities
│
└── frontend/                 # Next.js App Router + TypeScript
    └── src/
        ├── app/
        │   ├── page.tsx      # Main outreach copilot dashboard
        │   └── globals.css   # Black & white monochrome design system
        ├── lib/
        │   └── api.ts        # Typed backend API client
        └── types/
            └── index.ts      # TypeScript interfaces
```

---

## Security & Privacy

- `.env`, `.credentials/`, `data/profile.json`, and `data/resumes/` are strictly **gitignored**.
- Gmail OAuth tokens are persisted locally in `backend/.credentials/gmail_token.json` and auto-refreshed.
- **Zero auto-sending**: The system only creates drafts in your Gmail account. You retain 100% control to review and send manually.
