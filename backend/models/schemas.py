"""Pydantic models: request/response shapes + the schema-validated LLM output."""
from typing import Optional, List
from pydantic import BaseModel, Field


# ---------- LLM structured-extraction schema ----------
# This is what we ask the model to fill in per observation. Everything is
# optional except the entity itself, because "not every paper has every
# field" (spec section 10) - we never force information into existence.

class ExtractedObservation(BaseModel):
    biological_entity: Optional[str] = None
    entity_type: Optional[str] = None  # gene / protein / biomarker / organism / other
    organism: Optional[str] = None
    tissue: Optional[str] = None
    condition: Optional[str] = None
    treatment: Optional[str] = None
    experimental_group: Optional[str] = None
    control_group: Optional[str] = None
    measured_variable: Optional[str] = None
    value: Optional[str] = None  # kept as raw string pre-cleaning; Python layer parses numerics
    unit: Optional[str] = None
    sample_size: Optional[str] = None
    p_value: Optional[str] = None
    effect: Optional[str] = None
    method: Optional[str] = None
    source_page: Optional[int] = None
    evidence_quote: Optional[str] = Field(None, description="Verbatim sentence(s) from the paper supporting this observation")
    confidence: Optional[float] = Field(None, ge=0, le=1)


class ExtractionResult(BaseModel):
    observations: List[ExtractedObservation] = []


# ---------- API response models ----------

class PaperOut(BaseModel):
    id: int
    filename: str
    title: Optional[str]
    authors: Optional[str]
    journal: Optional[str]
    pub_year: Optional[str]
    doi: Optional[str]
    pmid: Optional[str]
    abstract: Optional[str]
    page_count: Optional[int]
    status: str
    uploaded_at: str
    error_message: Optional[str] = None


class PageOut(BaseModel):
    page_number: int
    text: str


class ObservationOut(BaseModel):
    id: int
    paper_id: int
    paper_title: Optional[str] = None
    biological_entity: Optional[str]
    entity_type: Optional[str]
    organism: Optional[str]
    tissue: Optional[str]
    condition: Optional[str]
    treatment: Optional[str]
    experimental_group: Optional[str]
    control_group: Optional[str]
    measured_variable: Optional[str]
    value: Optional[float]
    value_text: Optional[str]
    unit: Optional[str]
    sample_size: Optional[int]
    p_value: Optional[float]
    effect: Optional[str]
    method: Optional[str]
    source_page: Optional[int]
    confidence: Optional[float]
    validation_status: str
    evidence_quote: Optional[str] = None
    evidence_verified: Optional[bool] = None


class ObservationPatch(BaseModel):
    biological_entity: Optional[str] = None
    entity_type: Optional[str] = None
    organism: Optional[str] = None
    tissue: Optional[str] = None
    condition: Optional[str] = None
    treatment: Optional[str] = None
    experimental_group: Optional[str] = None
    control_group: Optional[str] = None
    measured_variable: Optional[str] = None
    value: Optional[float] = None
    value_text: Optional[str] = None
    unit: Optional[str] = None
    sample_size: Optional[int] = None
    p_value: Optional[float] = None
    effect: Optional[str] = None
    method: Optional[str] = None
