"""Fine-Tuning Arena API.

Phase 1 (make this rock solid first): GET / and GET /health.
Phase 2: the submissions API. It is backed by Postgres once DATABASE_URL is
set (see database.py); until then it falls back to an in-memory list so the
API is usable end-to-end without any infrastructure.
"""
import os
from datetime import datetime, timezone
from itertools import count
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import SubmissionRecord, get_db, init_db
from models import HealthResponse, RootResponse, SubmissionCreate, SubmissionOut

app = FastAPI(title="Fine-Tuning Arena API", version="0.1.0")

# The GitHub Pages frontend's origin, plus common localhost dev servers.
_allowed_origins = ["http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:8000"]
_frontend_origin = os.environ.get("FRONTEND_ORIGIN")
if _frontend_origin:
    _allowed_origins.append(_frontend_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory fallback store, used only until DATABASE_URL is configured.
_memory_submissions: list[dict] = []
_next_id = count(1)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/", response_model=RootResponse)
def read_root() -> RootResponse:
    return RootResponse(status="ok", service="Fine-Tuning Arena API")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="healthy")


def _with_derived_fields(data: dict) -> SubmissionOut:
    accuracy_gain = data["gsm8k_accuracy"] - data["baseline_accuracy"]
    trainable_percentage = 100 * data["trainable_parameters"] / data["total_parameters"]
    per_million = data["trainable_parameters"] / 1e6
    accuracy_gain_per_million_params = accuracy_gain / per_million if per_million else 0.0
    return SubmissionOut(
        **data,
        accuracy_gain=accuracy_gain,
        trainable_percentage=trainable_percentage,
        accuracy_gain_per_million_params=accuracy_gain_per_million_params,
    )


def _record_to_dict(record: SubmissionRecord) -> dict:
    data = {c.name: getattr(record, c.name) for c in record.__table__.columns}
    data["target_modules"] = data["target_modules"].split(",") if data["target_modules"] else None
    return data


@app.post("/api/submissions", response_model=SubmissionOut)
def create_submission(submission: SubmissionCreate, db: Optional[Session] = Depends(get_db)):
    data = submission.model_dump()

    if db is not None:
        record = SubmissionRecord(
            **{k: v for k, v in data.items() if k != "target_modules"},
            target_modules=",".join(data["target_modules"]) if data["target_modules"] else None,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return _with_derived_fields(_record_to_dict(record))

    data["id"] = next(_next_id)
    data["timestamp"] = datetime.now(timezone.utc)
    _memory_submissions.append(data)
    return _with_derived_fields(data)


@app.get("/api/submissions", response_model=list[SubmissionOut])
def list_submissions(db: Optional[Session] = Depends(get_db)):
    if db is not None:
        records = db.query(SubmissionRecord).order_by(SubmissionRecord.id).all()
        return [_with_derived_fields(_record_to_dict(r)) for r in records]

    return [_with_derived_fields(s) for s in _memory_submissions]


@app.get("/api/submissions/{submission_id}", response_model=SubmissionOut)
def get_submission(submission_id: int, db: Optional[Session] = Depends(get_db)):
    if db is not None:
        record = db.query(SubmissionRecord).filter(SubmissionRecord.id == submission_id).first()
        if record is None:
            raise HTTPException(status_code=404, detail="Submission not found")
        return _with_derived_fields(_record_to_dict(record))

    for s in _memory_submissions:
        if s["id"] == submission_id:
            return _with_derived_fields(s)
    raise HTTPException(status_code=404, detail="Submission not found")
