"""BioExtract backend - FastAPI application.

Route responsibilities stay separated per module:
  pdf/         -> PDF parsing only
  extraction/  -> LLM calls + evidence verification only
  processing/  -> Python cleaning/standardization only
  database/    -> SQLite schema + queries only
This file wires them together behind a clean HTTP API; the frontend never
touches SQLite directly.
"""
import os
import json
import traceback
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from database.schema import init_db, get_conn
from pdf.processor import validate_pdf, extract_pages, extract_deterministic_metadata, PDFProcessingError
from extraction.llm_extractor import extract_observations, ExtractionError
from extraction.evidence import verify_quote
from processing.cleaning import standardize_observation
from services.storage import save_pdf
from models.schemas import ObservationPatch

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "25")) * 1024 * 1024
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

app = FastAPI(title="BioExtract API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    init_db()


def _err(status: int, message: str):
    raise HTTPException(status_code=status, detail=message)


# ---------------------------------------------------------------- health --
@app.get("/api/health")
def health():
    return {"status": "ok", "demo_mode": not bool(GROQ_API_KEY)}


# ---------------------------------------------------------------- papers --
@app.post("/api/papers/upload")
async def upload_paper(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        _err(400, "Only .pdf files are accepted.")

    file_bytes = await file.read()
    try:
        validate_pdf(file_bytes, MAX_UPLOAD_BYTES)
    except PDFProcessingError as e:
        _err(400, str(e))

    storage_path = save_pdf(file_bytes, file.filename)

    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO paper (project_id, filename, storage_path, status) VALUES (1, ?, ?, 'Uploaded')",
            (file.filename, storage_path),
        )
        paper_id = cur.lastrowid

    # Process synchronously for MVP simplicity (spec favors a working
    # end-to-end pipeline over async job infrastructure).
    _process_pdf(paper_id, storage_path)

    return {"paper_id": paper_id}


def _process_pdf(paper_id: int, storage_path: str):
    with get_conn() as conn:
        conn.execute("UPDATE paper SET status='Processing' WHERE id=?", (paper_id,))
    try:
        pages = extract_pages(storage_path)
        meta = extract_deterministic_metadata(storage_path, pages)
        with get_conn() as conn:
            conn.execute(
                """UPDATE paper SET title=?, authors=?, journal=?, pub_year=?, doi=?, pmid=?,
                   abstract=?, page_count=?, status='Ready' WHERE id=?""",
                (meta["title"], meta["authors"], meta["journal"], meta["pub_year"], meta["doi"],
                 meta["pmid"], meta["abstract"], meta["page_count"], paper_id),
            )
            for p in pages:
                conn.execute(
                    "INSERT OR REPLACE INTO paper_page (paper_id, page_number, text) VALUES (?, ?, ?)",
                    (paper_id, p["pageNumber"], p["text"]),
                )
    except PDFProcessingError as e:
        with get_conn() as conn:
            conn.execute("UPDATE paper SET status='Failed', error_message=? WHERE id=?", (str(e), paper_id))
    except Exception as e:
        with get_conn() as conn:
            conn.execute("UPDATE paper SET status='Failed', error_message=? WHERE id=?", (f"Unexpected error: {e}", paper_id))


@app.get("/api/papers")
def list_papers():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM paper ORDER BY uploaded_at DESC").fetchall()
    return [dict(r) for r in rows]


@app.get("/api/papers/{paper_id}")
def get_paper(paper_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM paper WHERE id=?", (paper_id,)).fetchone()
    if not row:
        _err(404, "Paper not found.")
    return dict(row)


@app.get("/api/papers/{paper_id}/pages")
def get_pages(paper_id: int):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT page_number, text FROM paper_page WHERE paper_id=? ORDER BY page_number", (paper_id,)
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/papers/{paper_id}/file")
def get_paper_file(paper_id: int):
    from fastapi.responses import FileResponse
    with get_conn() as conn:
        row = conn.execute("SELECT storage_path, filename FROM paper WHERE id=?", (paper_id,)).fetchone()
    if not row or not os.path.exists(row["storage_path"]):
        _err(404, "PDF file not found.")
    return FileResponse(row["storage_path"], media_type="application/pdf", filename=row["filename"])


# ------------------------------------------------------------ extraction --
@app.post("/api/papers/{paper_id}/extract")
def extract(paper_id: int):
    with get_conn() as conn:
        paper = conn.execute("SELECT * FROM paper WHERE id=?", (paper_id,)).fetchone()
        if not paper:
            _err(404, "Paper not found.")
        pages = conn.execute(
            "SELECT page_number, text FROM paper_page WHERE paper_id=? ORDER BY page_number", (paper_id,)
        ).fetchall()

    if not pages:
        _err(400, "Paper has not been processed yet (no page text available).")

    page_dicts = [{"pageNumber": p["page_number"], "text": p["text"]} for p in pages]
    page_text_by_num = {p["pageNumber"]: p["text"] for p in page_dicts}

    try:
        result = extract_observations(page_dicts, GROQ_API_KEY)
    except ExtractionError as e:
        with get_conn() as conn:
            conn.execute("UPDATE paper SET status='Failed', error_message=? WHERE id=?", (str(e), paper_id))
        _err(502, str(e))

    created = 0
    with get_conn() as conn:
        for obs in result.observations:
            raw_json = json.dumps(obs.model_dump())
            cur = conn.execute(
                "INSERT INTO raw_observation (paper_id, raw_json) VALUES (?, ?)", (paper_id, raw_json)
            )
            raw_id = cur.lastrowid

            page_text = page_text_by_num.get(obs.source_page, "")
            verification = verify_quote(obs.evidence_quote, page_text)
            cur = conn.execute(
                "INSERT INTO evidence (paper_id, source_page, quote, verified) VALUES (?, ?, ?, ?)",
                (paper_id, obs.source_page, obs.evidence_quote, int(verification["verified"])),
            )
            evidence_id = cur.lastrowid

            cleaned = standardize_observation(obs.model_dump())
            confidence = cleaned.get("confidence")
            if not verification["verified"] and confidence is not None:
                confidence = min(confidence, 0.4)  # lower confidence on unverified evidence

            status = "STAGED" if verification["verified"] else "NEEDS_REVIEW"

            conn.execute(
                """INSERT INTO observation (
                    paper_id, raw_observation_id, evidence_id, biological_entity, entity_type,
                    organism, tissue, condition, treatment, experimental_group, control_group,
                    measured_variable, value, value_text, unit, sample_size, p_value, effect,
                    method, source_page, confidence, validation_status
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    paper_id, raw_id, evidence_id, cleaned["biological_entity"], cleaned["entity_type"],
                    cleaned["organism"], cleaned["tissue"], cleaned["condition"], cleaned["treatment"],
                    cleaned["experimental_group"], cleaned["control_group"], cleaned["measured_variable"],
                    cleaned["value"], cleaned["value_text"], cleaned["unit"], cleaned["sample_size"],
                    cleaned["p_value"], cleaned["effect"], cleaned["method"], cleaned["source_page"],
                    confidence, status,
                ),
            )
            created += 1

        conn.execute("UPDATE paper SET status='Extraction Complete' WHERE id=?", (paper_id,))

    return {"observations_created": created}


# ----------------------------------------------------------- observations --
@app.get("/api/papers/{paper_id}/observations")
def get_paper_observations(paper_id: int):
    return _query_observations("WHERE o.paper_id=?", (paper_id,))


@app.get("/api/datasets")
def get_dataset():
    """Unified cross-paper dataset."""
    return _query_observations("", ())


def _query_observations(where: str, params: tuple):
    sql = f"""
    SELECT o.*, p.title as paper_title, e.quote as evidence_quote, e.verified as evidence_verified
    FROM observation o
    JOIN paper p ON p.id = o.paper_id
    LEFT JOIN evidence e ON e.id = o.evidence_id
    {where}
    ORDER BY o.created_at DESC
    """
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["evidence_verified"] = bool(d["evidence_verified"]) if d["evidence_verified"] is not None else None
        out.append(d)
    return out


@app.patch("/api/observations/{obs_id}")
def patch_observation(obs_id: int, patch: ObservationPatch):
    fields = {k: v for k, v in patch.model_dump().items() if v is not None}
    if not fields:
        return {"updated": False}
    set_clause = ", ".join(f"{k}=?" for k in fields)
    with get_conn() as conn:
        conn.execute(
            f"UPDATE observation SET {set_clause}, validation_status='EDITED' WHERE id=?",
            (*fields.values(), obs_id),
        )
    return {"updated": True}


@app.post("/api/observations/{obs_id}/approve")
def approve_observation(obs_id: int):
    with get_conn() as conn:
        conn.execute("UPDATE observation SET validation_status='VERIFIED' WHERE id=?", (obs_id,))
    return {"status": "VERIFIED"}


@app.post("/api/observations/{obs_id}/reject")
def reject_observation(obs_id: int):
    with get_conn() as conn:
        conn.execute("UPDATE observation SET validation_status='REJECTED' WHERE id=?", (obs_id,))
    return {"status": "REJECTED"}
