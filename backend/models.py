"""Pydantic schemas for the Fine-Tuning Arena API.

Request/response validation lives here instead of passing raw dicts around,
so the API rejects malformed submissions before they ever reach the database.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class RootResponse(BaseModel):
    status: str
    service: str


class HealthResponse(BaseModel):
    status: str


class SubmissionCreate(BaseModel):
    student: str
    run_name: str
    base_model: str
    method: str  # "full_ft" | "partial_ft" | "lora" | "qlora"

    # LoRA/QLoRA-specific — not every method uses them.
    lora_rank: Optional[int] = None
    target_modules: Optional[list[str]] = None

    trainable_parameters: int
    total_parameters: int
    training_examples: Optional[int] = None
    training_time_seconds: Optional[float] = None
    peak_vram_mb: Optional[float] = None
    adapter_bytes: Optional[int] = None

    gsm8k_accuracy: float = Field(ge=0, le=1)
    baseline_accuracy: float = Field(ge=0, le=1)

    git_commit: Optional[str] = None


class SubmissionOut(SubmissionCreate):
    id: int
    timestamp: datetime

    # Computed server-side — never trusted from the client.
    accuracy_gain: float
    trainable_percentage: float
    accuracy_gain_per_million_params: float
