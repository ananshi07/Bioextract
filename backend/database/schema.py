"""SQLite schema + connection helper. Single source of truth for DB structure.

Kept as plain sqlite3 (no ORM) so a future R script can read the same
bioextract.db file directly with RSQLite without any translation layer.
"""
import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.getenv(
    "DATABASE_PATH",
    os.path.join(os.path.dirname(__file__), "../../data/bioextract.db"),
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS app_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'Default Project',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paper (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES project(id),
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    title TEXT,
    authors TEXT,
    journal TEXT,
    pub_year TEXT,
    doi TEXT,
    pmid TEXT,
    abstract TEXT,
    page_count INTEGER,
    status TEXT NOT NULL DEFAULT 'Uploaded',
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS paper_page (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    text TEXT,
    UNIQUE(paper_id, page_number)
);

CREATE TABLE IF NOT EXISTS raw_observation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
    raw_json TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
    source_page INTEGER,
    quote TEXT,
    verified INTEGER DEFAULT 0
);

-- Unified, standardized, cross-paper observation table.
CREATE TABLE IF NOT EXISTS observation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
    raw_observation_id INTEGER REFERENCES raw_observation(id),
    evidence_id INTEGER REFERENCES evidence(id),
    biological_entity TEXT,
    entity_type TEXT,
    organism TEXT,
    tissue TEXT,
    condition TEXT,
    treatment TEXT,
    experimental_group TEXT,
    control_group TEXT,
    measured_variable TEXT,
    value REAL,
    value_text TEXT,
    unit TEXT,
    sample_size INTEGER,
    p_value REAL,
    effect TEXT,
    method TEXT,
    source_page INTEGER,
    confidence REAL,
    validation_status TEXT NOT NULL DEFAULT 'STAGED',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


@contextmanager
def get_conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        paper_columns = {row["name"] for row in conn.execute("PRAGMA table_info(paper)").fetchall()}
        if "owner_id" not in paper_columns:
            conn.execute(
                "ALTER TABLE paper ADD COLUMN owner_id INTEGER REFERENCES app_user(id) ON DELETE CASCADE"
            )
        conn.execute(
            "INSERT INTO project (id, name) "
            "SELECT 1, 'Default Project' WHERE NOT EXISTS (SELECT 1 FROM project WHERE id=1)"
        )
