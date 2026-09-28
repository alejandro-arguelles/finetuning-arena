"""Database layer for the Fine-Tuning Arena API.

Kept isolated from the API routes in main.py so Postgres can be plugged in
(Phase 3) without coupling database code to request handling. Until
DATABASE_URL is set, `engine`/`SessionLocal` stay None and main.py falls back
to an in-memory store — the app never crashes for lack of a database.

Credentials are never hardcoded: the connection string comes only from the
DATABASE_URL environment variable, which Render injects at deploy time.
"""
import os
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL")

Base = declarative_base()


class SubmissionRecord(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    student = Column(String, nullable=False)
    run_name = Column(String, nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    base_model = Column(String, nullable=False)
    method = Column(String, nullable=False)
    lora_rank = Column(Integer, nullable=True)
    target_modules = Column(String, nullable=True)  # stored as a comma-joined string
    trainable_parameters = Column(Integer, nullable=False)
    total_parameters = Column(Integer, nullable=False)
    training_examples = Column(Integer, nullable=True)
    training_time_seconds = Column(Float, nullable=True)
    peak_vram_mb = Column(Float, nullable=True)
    adapter_bytes = Column(Integer, nullable=True)
    gsm8k_accuracy = Column(Float, nullable=False)
    baseline_accuracy = Column(Float, nullable=False)
    git_commit = Column(String, nullable=True)


engine = create_engine(DATABASE_URL) if DATABASE_URL else None
SessionLocal = (
    sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None
)


def init_db() -> None:
    """Create tables if a database is configured. No-op otherwise."""
    if engine is not None:
        Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency. Yields a session, or None when no DB is configured."""
    if SessionLocal is None:
        yield None
        return
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
