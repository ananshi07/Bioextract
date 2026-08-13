"""Evidence verification: confirm the model's quoted evidence actually
appears on the cited page. If it doesn't (fabrication, wrong page, paraphrase
too loose), we mark it unverified and lower confidence rather than trusting
it silently (spec section 12)."""
import re
from difflib import SequenceMatcher
from typing import Dict, Optional

MATCH_THRESHOLD = 0.75


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip().lower()


def verify_quote(quote: Optional[str], page_text: Optional[str]) -> Dict:
    """Returns {'verified': bool, 'similarity': float}."""
    if not quote or not page_text:
        return {"verified": False, "similarity": 0.0}

    norm_quote = _normalize(quote)
    norm_page = _normalize(page_text)

    if norm_quote in norm_page:
        return {"verified": True, "similarity": 1.0}

    # Fuzzy match: slide the quote length across the page text to find best window
    best = 0.0
    window = len(norm_quote)
    if window == 0:
        return {"verified": False, "similarity": 0.0}
    step = max(1, window // 4)
    for i in range(0, max(1, len(norm_page) - window + 1), step):
        chunk = norm_page[i:i + window]
        ratio = SequenceMatcher(None, norm_quote, chunk).ratio()
        best = max(best, ratio)

    return {"verified": best >= MATCH_THRESHOLD, "similarity": round(best, 3)}
