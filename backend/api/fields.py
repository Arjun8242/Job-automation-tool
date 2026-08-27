from fastapi import APIRouter
from pydantic import BaseModel

from services.ai_service import classify_fields

router = APIRouter()


class FieldInput(BaseModel):
    id: str
    label: str = ""
    type: str = "text"


class ClassifyRequest(BaseModel):
    fields: list[FieldInput]


class ClassifiedField(BaseModel):
    id: str
    category: str
    confidence: str = "high"


class ClassifyResponse(BaseModel):
    fields: list[ClassifiedField]


@router.post("/classify", response_model=ClassifyResponse)
async def classify(request: ClassifyRequest):
    """Classify ambiguous form fields using LLM."""
    fields_dicts = [f.model_dump() for f in request.fields]
    results = classify_fields(fields_dicts)
    return ClassifyResponse(fields=[ClassifiedField(**r) for r in results])
