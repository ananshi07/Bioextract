# BioExtract

AI-assisted scientific literature mining. BioExtract turns unstructured biological
research paper PDFs into structured, evidence-traceable research data stored in SQLite.

It is **not** a PDF reader, a "chat with your PDF" tool, or a ChatGPT clone. The
workflow is: upload → parse → AI-extract structured observations → verify evidence
→ human review → Python clean/standardize → store in a shared SQLite schema →
browse the unified, cross-paper dataset.

## Current MVP vs. future scope

**Implemented now:** paper upload, PDF processing (page-aware text + deterministic
metadata), paper viewer (PDF + text view), AI-assisted structured extraction with
schema validation, evidence grounding + verification against source text, human
review (approve/edit/reject), Python cleaning/standardization, SQLite storage,
multi-paper support into one unified dataset, dataset table UI.

**Explicitly out of scope for this version:** R integration, statistical tests,
regression/ANOVA/correlation, meta-analysis, generated visualizations or reports.
The "Analysis", "Visualizations", and "Reports" nav items are placeholders that
say so — they do not fake functionality.

## Architecture

```
Research Paper PDF
      │
      ▼
PDF processing (pypdf)              backend/pdf/
      │  page-aware text + deterministic metadata
      ▼
AI extraction (Groq, free tier)     backend/extraction/llm_extractor.py
      │  schema-validated (Pydantic) structured observations
      ▼
Evidence verification               backend/extraction/evidence.py
      │  quote checked against source page text
      ▼
Human review (approve/edit/reject)  frontend + PATCH /api/observations/:id
      │
      ▼
Python cleaning/standardization     backend/processing/cleaning.py
      │
      ▼
SQLite (unified, cross-paper)       backend/database/schema.py
      │
      ▼
Dataset UI                          frontend/src/pages/Dataset.tsx
      │
      │  FUTURE PHASE (not built here)
      ▼
      R → statistics → visualization
```

The backend never lets PDF parsing, LLM logic, cleaning, or persistence code mix:
`pdf/`, `extraction/`, `processing/`, and `database/` are separate modules. A
future R script can open `data/bioextract.db` directly (plain SQLite, no ORM
lock-in) and read the `observation` table without needing to know anything about
PDFs, LLM prompts, or the frontend.

## Tech stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, React Router, lucide-react
- **Backend:** Python, FastAPI
- **Data processing:** Python (pypdf, regex-based cleaning)
- **Database:** SQLite (plain `sqlite3`, no ORM)
- **AI:** Groq API (free tier, e.g. llama-3.3-70b-versatile via OpenAI-compatible tool calling), validated with Pydantic

## Folder structure

```
bioextract/
├── frontend/           React/Vite app
│   └── src/
│       ├── pages/       Landing, Papers, PaperViewer, Dataset, Future
│       ├── components/  Nav, DnaHelix
│       └── lib/api.ts   fetch wrapper for the backend API
├── backend/
│   ├── main.py          FastAPI app, route wiring
│   ├── pdf/              PDF parsing only
│   ├── extraction/       LLM calls + evidence verification only
│   ├── processing/       Python cleaning/standardization only
│   ├── database/         SQLite schema + connection only
│   ├── models/           Pydantic schemas
│   └── services/         local file storage abstraction
├── data/                 generated SQLite DB lives here (gitignored)
├── uploads/               generated PDF storage (gitignored)
├── .env.example
└── .gitignore
```

## Setup

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env     # then fill in GROQ_API_KEY (free, see below)
uvicorn main:app --reload --port 8000
```

The SQLite database is created automatically at `data/bioextract.db` on first run.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`. Vite proxies `/api` to `http://localhost:8000`.

### Environment variables

See `.env.example`. Only `GROQ_API_KEY` is required for real AI extraction — get a
free key (no credit card required) at https://console.groq.com/keys. Without it,
paper upload/viewing/browsing still works but the "Run AI Extraction" call will
return a clear error (`/api/health` reports `demo_mode: true` in that case).

## How it works

- **Upload:** drag-and-drop or file picker on the Papers page. Files are validated
  (type, size, PDF header) before being stored locally under `uploads/`.
- **Processing:** `pdf/processor.py` extracts per-page text (never flattened into
  one blob) plus best-effort deterministic metadata (title, DOI, PMID, year,
  abstract). Undetected fields are `null`/"Not detected" — never guessed.
- **Extraction:** `extraction/llm_extractor.py` sends page-labelled text to the
  Groq API (OpenAI-compatible endpoint) with a forced tool-call, so the response is schema-validated
  JSON rather than free-form chat text. Missing fields stay `null`.
- **Evidence verification:** `extraction/evidence.py` checks the model's quoted
  evidence against the actual text of the cited page (exact match, then a fuzzy
  match). Unverified evidence lowers confidence and routes the observation into
  `NEEDS_REVIEW` instead of being trusted silently.
- **Human review:** every observation starts as `STAGED` (or `NEEDS_REVIEW`).
  Users can approve (`VERIFIED`), edit (`EDITED`), or reject (`REJECTED`) from
  the paper viewer or dataset table.
- **Python cleaning:** `processing/cleaning.py` normalizes whitespace, a small
  set of entity aliases (e.g. `BRCA-1`/`BRCA 1`/`brca1` → `BRCA1`), parses
  numeric values/units/p-values/sample sizes out of raw strings, and never
  changes scientific meaning — only representation.
- **Database:** plain relational SQLite (`project`, `paper`, `paper_page`,
  `raw_observation`, `evidence`, `observation`). Raw and standardized data are
  kept separate for provenance.
- **Multiple papers:** every paper runs through the same pipeline into the same
  `observation` table, keyed by `paper_id`. The Dataset page queries across all
  papers at once — this is the foundation for future cross-paper R analysis.

## Current limitations

- Extraction runs synchronously on request (no background job queue) — fine for
  MVP-scale single-paper processing, not for large batch jobs.
- Deterministic metadata extraction is heuristic (regex/PDF metadata), not a
  bibliographic API lookup — it will sometimes report "Not detected".
- Entity-name standardization covers a small illustrative alias set, not a full
  ontology (e.g. HGNC).
- No authentication/multi-user support — single local project.

## Future development (not implemented)

R will read directly from `data/bioextract.db` (verified/standardized
observations only) to run descriptive statistics, hypothesis tests, correlation,
and regression, with results surfaced in the currently-placeholder Analysis /
Visualizations / Reports sections. This requires no changes to the PDF, AI
extraction, or cleaning layers — only a new read-only R consumer of the existing
schema.

## Audit notes

This project was built and reviewed for internal consistency (imports, route
wiring, schema references, `.gitignore` coverage) at the code level. It has
**not** been run against a live Groq API key or a live `npm install` in
this environment — network access is unavailable here, so dependency
installation and end-to-end execution should be verified locally before use.
