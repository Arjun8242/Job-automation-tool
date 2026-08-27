"""
Gmail Service — Phase 4 Implementation.

Provides:
  is_connected()   — check if valid OAuth credentials exist
  get_auth_url()   — initiate OAuth flow via local browser
  authenticate()   — run InstalledAppFlow.run_local_server() (blocking)
  get_credentials() — load & auto-refresh stored tokens
  create_draft()   — build MIME message with optional PDF attachment and insert into Gmail Drafts
"""
import base64
import glob
import html
import json
import logging
import os
import re
import threading
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Optional

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCOPES = ["https://www.googleapis.com/auth/gmail.compose"]

_CREDENTIALS_DIR = Path(__file__).resolve().parent.parent / ".credentials"
_TOKEN_PATH = _CREDENTIALS_DIR / "gmail_token.json"


def _find_client_secret() -> Optional[Path]:
    """Discover the client_secret_*.json file in the .credentials directory."""
    pattern = str(_CREDENTIALS_DIR / "client_secret_*.json")
    matches = glob.glob(pattern)
    if matches:
        return Path(matches[0])
    # Fallback: any .json that isn't the token file
    for f in _CREDENTIALS_DIR.iterdir():
        if f.suffix == ".json" and f.name != "gmail_token.json" and "client" in f.name.lower():
            return f
    return None


def text_to_html(text: str) -> str:
    """
    Convert plain text/markdown email body into clean, styled HTML
    with clickable links for Portfolio, GitHub, LinkedIn, and any URLs.
    """
    escaped = html.escape(text)

    # 1. Convert markdown links: [Text](https://url) -> <a href="https://url">Text</a>
    def _md_link_sub(match):
        label = match.group(1)
        url = match.group(2)
        return f'<a href="{url}" target="_blank" style="color: #1a73e8; text-decoration: underline;">{label}</a>'

    escaped = re.sub(r'\[([^\]]+)\]\((https?://[^\s\)]+)\)', _md_link_sub, escaped)

    # 2. Convert standalone URLs (not inside href="...") into clickable links
    def _url_sub(match):
        url = match.group(0)
        trailing = ""
        while url and url[-1] in ".,;:)":
            trailing = url[-1] + trailing
            url = url[:-1]
        return f'<a href="{url}" target="_blank" style="color: #1a73e8; text-decoration: underline;">{url}</a>{trailing}'

    escaped = re.sub(r'(?<!href=")(?<!">)(https?://[^\s<>"\'\)]+)', _url_sub, escaped)

    # 3. Format paragraphs and line breaks
    paragraphs = [p.strip() for p in escaped.split("\n\n") if p.strip()]
    formatted_paras = []
    for p in paragraphs:
        p_html = p.replace("\n", "<br>")
        formatted_paras.append(f'<p style="margin: 0 0 14px 0; padding: 0;">{p_html}</p>')

    content = "\n".join(formatted_paras)
    return (
        f'<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; '
        f'font-size: 14px; line-height: 1.5; color: #202124;">\n{content}\n</div>'
    )


class GmailService:
    """Handles Google OAuth 2.0 and Gmail API draft creation."""

    def __init__(self):
        self._client_secret_path = _find_client_secret()
        self._auth_thread: Optional[threading.Thread] = None
        self._auth_in_progress = False

    # ── Credentials ────────────────────────────────────────────

    def get_credentials(self) -> Optional[Credentials]:
        """Load and auto-refresh stored OAuth credentials. Returns None if not available."""
        if not _TOKEN_PATH.exists():
            return None

        try:
            creds = Credentials.from_authorized_user_file(str(_TOKEN_PATH), SCOPES)
        except Exception as e:
            logger.warning("Failed to load token file: %s", e)
            return None

        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                # Persist refreshed token
                _TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
                logger.info("OAuth token refreshed and saved.")
            except Exception as e:
                logger.warning("Token refresh failed: %s", e)
                return None

        if creds and creds.valid:
            return creds

        return None

    def is_connected(self) -> dict:
        """Check if valid Gmail credentials exist. Returns {connected, email}."""
        creds = self.get_credentials()
        if not creds:
            return {"connected": False, "email": None}

        # Try to get the user's email from the token info
        email = None
        try:
            service = build("gmail", "v1", credentials=creds, cache_discovery=False)
            profile = service.users().getProfile(userId="me").execute()
            email = profile.get("emailAddress")
        except Exception as e:
            logger.warning("Could not fetch Gmail profile: %s", e)

        return {"connected": True, "email": email}

    # ── OAuth Flow ────────────────────────────────────────────

    def get_auth_url(self) -> Optional[str]:
        """
        Start the OAuth flow in a background thread using run_local_server().
        Returns a message indicating the flow has been started.
        The browser will open automatically for consent.
        """
        if not self._client_secret_path:
            logger.error("No client_secret_*.json found in .credentials/")
            return None

        if self._auth_in_progress:
            return "AUTH_IN_PROGRESS"

        # Check if already connected
        creds = self.get_credentials()
        if creds and creds.valid:
            return "ALREADY_CONNECTED"

        # Start the flow in a background thread so the API doesn't block
        self._auth_in_progress = True

        def _run_flow():
            try:
                flow = InstalledAppFlow.from_client_secrets_file(
                    str(self._client_secret_path), SCOPES
                )
                creds = flow.run_local_server(
                    port=8090,
                    prompt="consent",
                    success_message="Gmail connected! You can close this tab and return to the app.",
                    open_browser=True,
                )
                # Save credentials
                _CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)
                _TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")
                logger.info("OAuth flow complete — token saved.")
            except Exception as e:
                logger.error("OAuth flow failed: %s", e)
            finally:
                self._auth_in_progress = False

        self._auth_thread = threading.Thread(target=_run_flow, daemon=True)
        self._auth_thread.start()
        return "FLOW_STARTED"

    def disconnect(self):
        """Remove stored credentials."""
        if _TOKEN_PATH.exists():
            _TOKEN_PATH.unlink()
            logger.info("Gmail token removed — disconnected.")

    # ── Draft Creation ────────────────────────────────────────

    def create_draft(
        self,
        to: str,
        subject: str,
        body: str,
        resume_path: Optional[Path] = None,
    ) -> dict:
        """
        Build a MIME email and insert it as a Gmail draft.

        Args:
            to: Recipient email address.
            subject: Email subject line.
            body: Plain-text email body.
            resume_path: Optional path to a PDF file to attach.

        Returns:
            {draft_id, draft_url, message}
        """
        creds = self.get_credentials()
        if not creds:
            raise RuntimeError("Gmail not connected. Please authenticate first.")

        # Build HTML version of body with clickable links
        html_body = text_to_html(body)

        # Create alternative part (plain text + HTML)
        alt_part = MIMEMultipart("alternative")
        alt_part.attach(MIMEText(body, "plain", "utf-8"))
        alt_part.attach(MIMEText(html_body, "html", "utf-8"))

        # Build MIME message with optional attachment
        if resume_path and resume_path.exists():
            msg = MIMEMultipart("mixed")
            msg.attach(alt_part)

            # Attach PDF
            with open(resume_path, "rb") as f:
                pdf_data = f.read()
            attachment = MIMEApplication(pdf_data, _subtype="pdf")
            attachment.add_header(
                "Content-Disposition",
                "attachment",
                filename=resume_path.name,
            )
            msg.attach(attachment)
        else:
            msg = alt_part

        msg["To"] = to
        msg["Subject"] = subject

        # Base64url-encode
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

        # Create draft via Gmail API
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        draft = service.users().drafts().create(
            userId="me",
            body={"message": {"raw": raw}},
        ).execute()

        draft_id = draft["id"]
        message_id = draft.get("message", {}).get("id", "")

        # Construct a direct link to the draft in Gmail
        draft_url = f"https://mail.google.com/mail/u/0/#drafts/{message_id}" if message_id else None

        logger.info("Gmail draft created: id=%s", draft_id)

        return {
            "draft_id": draft_id,
            "draft_url": draft_url,
            "message": f"Draft created successfully! Check your Gmail drafts.",
        }


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

gmail_service = GmailService()
