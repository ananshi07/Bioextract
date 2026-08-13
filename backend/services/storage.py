"""Local filesystem storage abstraction. Swappable later for S3/etc without
touching API or extraction code."""
import os
import uuid

UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "../../uploads"))


def save_pdf(file_bytes: bytes, original_filename: str) -> str:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}.pdf"
    path = os.path.join(UPLOAD_DIR, safe_name)
    with open(path, "wb") as f:
        f.write(file_bytes)
    return path


def delete_pdf(path: str) -> None:
    if path and os.path.exists(path):
        os.remove(path)
