"""
JSON read/write helpers for local data storage.
All data lives in the ../../data/ directory relative to this file.
"""
import json
import os
from pathlib import Path
from typing import Any

# Resolve the data directory regardless of where Python is invoked from
_BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = _BACKEND_DIR.parent / "data"
RESUMES_DIR = DATA_DIR / "resumes"


def _data_path(filename: str) -> Path:
    return DATA_DIR / filename


def read_json(filename: str) -> Any:
    """Read and return parsed JSON from data/<filename>."""
    path = _data_path(filename)
    if not path.exists():
        raise FileNotFoundError(f"Data file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(filename: str, data: Any) -> None:
    """Serialize data to JSON and write to data/<filename>."""
    path = _data_path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def list_resumes() -> list[str]:
    """Return filenames of all PDFs in the resumes directory."""
    if not RESUMES_DIR.exists():
        return []
    return sorted(
        f.name for f in RESUMES_DIR.iterdir() if f.is_file() and f.suffix.lower() == ".pdf"
    )


def resume_path(filename: str) -> Path:
    """Return a safe absolute path to a resume PDF inside data/resumes."""
    resume_root = RESUMES_DIR.resolve()
    candidate = (RESUMES_DIR / filename).resolve()
    if candidate.parent != resume_root or candidate.suffix.lower() != ".pdf":
        raise ValueError("Invalid resume filename")
    return candidate
