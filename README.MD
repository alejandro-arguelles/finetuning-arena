# Fine-Tuning Arena

Infrastructure for an LLM fine-tuning leaderboard. Students fine-tune
`Qwen/Qwen3-0.6B-Base` on GSM8K from a separate homework repository, then submit
their results to this project's API, which stores them and (eventually) renders
them as an interactive leaderboard.

## Architecture

```
Student's computer
      │  POST /api/submissions
      ▼
Render (Uvicorn + FastAPI)
      │  SQL
      ▼
Neon PostgreSQL
      ▲
      │  GET /api/submissions
GitHub Pages frontend
```

The very first milestone, and the only thing that needs to work before anything
else is added, is:

```
GitHub → Render → Uvicorn → FastAPI → GET /
```

## Repository structure

```
backend/
├── main.py            # FastAPI app: routes, CORS, startup
├── models.py           # Pydantic schemas (request/response validation)
├── database.py          # SQLAlchemy engine/session + ORM model (Neon Postgres)
└── requirements.txt

frontend/
├── index.html          # placeholder leaderboard page
├── app.js               # fetches /api/submissions from the Render API
└── style.css

.gitignore
README.MD
```

## Backend

### Local development

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

- `GET /` → `{"status": "ok", "service": "Fine-Tuning Arena API"}`
- `GET /health` → `{"status": "healthy"}`
- `POST /api/submissions`, `GET /api/submissions`, `GET /api/submissions/{id}`

Without a `DATABASE_URL` set, submissions are kept in an in-memory list so the
API is usable before Postgres is wired up. Once `DATABASE_URL` points at a Neon
Postgres instance, the same endpoints persist to the database instead.

### Render deployment

- **Language**: Python 3
- **Branch**: `main`
- **Root Directory**: `backend`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

No environment variables are required to deploy Phase 1. `$PORT` is provided by
Render automatically. Later, set `DATABASE_URL` (Neon Postgres connection
string) and optionally `FRONTEND_ORIGIN` (the GitHub Pages URL, for CORS).

This is an ASGI app served by Uvicorn — no Gunicorn/WSGI involved.

## Frontend

Static HTML/CSS/JS, deployed independently on GitHub Pages. It only talks to
the backend over `fetch()` — it never touches the database directly. Set the
API base URL in `frontend/app.js` (`API_BASE_URL`) once the Render service is
live.

Future work: a sortable submissions table and Plotly scatter plots (accuracy vs
trainable parameters, adapter size, training time, peak VRAM, etc.), with
selectable X/Y metrics and log axes where appropriate.

## Student submission flow

```
train → official GSM8K evaluation → results.json → submit.py
                                                        │ HTTP POST
                                                        ▼
                                         Render / FastAPI → Neon PostgreSQL
                                                        │
                                                        ▼
                                          GitHub Pages leaderboard (GET)
```

Students never need database credentials — `submit.py` (in the homework repo)
only talks to the public API over HTTP.

## Submission fields

```
id, student, run_name, timestamp, base_model, method,
lora_rank, target_modules, trainable_parameters, total_parameters,
training_examples, training_time_seconds, peak_vram_mb, adapter_bytes,
gsm8k_accuracy, baseline_accuracy, git_commit
```

`method` is one of `full_ft`, `partial_ft`, `lora`, `qlora` — LoRA-specific
fields (`lora_rank`, `target_modules`) are optional since they don't apply to
every method. The API computes derived metrics server-side rather than trusting
the client:

```
accuracy_gain = gsm8k_accuracy - baseline_accuracy
trainable_percentage = 100 * trainable_parameters / total_parameters
accuracy_gain_per_million_params = accuracy_gain / (trainable_parameters / 1e6)
```
