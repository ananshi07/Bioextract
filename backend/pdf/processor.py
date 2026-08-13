"""PDF processing. Extracts page-aware text + deterministic metadata.

Never flattens the document into one giant text field (spec section 7) -
callers get a list of {page_number, text} so evidence can cite a real page.
"""
import re
from typing import Optional, List, Dict
from pypdf import PdfReader


class PDFProcessingError(Exception):
    pass


def validate_pdf(file_bytes: bytes, max_size_bytes: int) -> None:
    if len(file_bytes) == 0:
        raise PDFProcessingError("File is empty.")
    if len(file_bytes) > max_size_bytes:
        raise PDFProcessingError(f"File exceeds max size of {max_size_bytes} bytes.")
    if not file_bytes[:5] == b"%PDF-":
        raise PDFProcessingError("File does not appear to be a valid PDF (missing %PDF- header).")


def extract_pages(path: str) -> List[Dict]:
    """Returns [{'pageNumber': int, 'text': str}, ...], 1-indexed."""
    try:
        reader = PdfReader(path)
    except Exception as e:
        raise PDFProcessingError(f"Could not open PDF: {e}")

    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception:
            raise PDFProcessingError("PDF is password-protected and could not be opened.")

    pages = []
    for i, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        pages.append({"pageNumber": i + 1, "text": text})
    return pages


def extract_deterministic_metadata(path: str, pages: List[Dict]) -> Dict:
    """Best-effort deterministic metadata. NEVER invents values - unresolved
    fields are left as None so the API/UI can show 'Not detected'."""
    reader = PdfReader(path)
    info = reader.metadata or {}

    title = _clean(info.get("/Title")) if info else None
    authors = _clean(info.get("/Author")) if info else None

    first_page_text = pages[0]["text"] if pages else ""

    doi = _find_doi(first_page_text) or _find_doi("\n".join(p["text"] for p in pages[:3]))
    pmid = _find_pmid("\n".join(p["text"] for p in pages[:2]))

    # Fallback title heuristic: first substantial line of page 1 if PDF metadata lacks one
    if not title and first_page_text:
        for line in first_page_text.splitlines():
            line = line.strip()
            if 15 < len(line) < 200:
                title = line
                break

    return {
        "title": title,
        "authors": authors,
        "journal": None,       # left for future refinement - never guessed
        "pub_year": _find_year(first_page_text),
        "doi": doi,
        "pmid": pmid,
        "abstract": _find_abstract(pages),
        "page_count": len(pages),
    }


def _clean(val) -> Optional[str]:
    if not val:
        return None
    val = str(val).strip()
    return val or None


def _find_doi(text: str) -> Optional[str]:
    m = re.search(r"\b10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", text)
    return m.group(0).rstrip(".") if m else None


def _find_pmid(text: str) -> Optional[str]:
    m = re.search(r"PMID:?\s*(\d{6,9})", text, re.IGNORECASE)
    return m.group(1) if m else None


def _find_year(text: str) -> Optional[str]:
    m = re.search(r"\b(19|20)\d{2}\b", text)
    return m.group(0) if m else None


def _find_abstract(pages: List[Dict]) -> Optional[str]:
    for p in pages[:2]:
        t = p["text"]
        idx = t.lower().find("abstract")
        if idx != -1:
            snippet = t[idx + len("abstract"):idx + 2000]
            end = re.search(r"\n\s*(introduction|keywords|1\.)\s*\n", snippet, re.IGNORECASE)
            snippet = snippet[: end.start()] if end else snippet[:1500]
            return snippet.strip(" :\n") or None
    return None
