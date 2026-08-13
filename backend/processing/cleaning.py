"""Python cleaning + standardization layer.

Takes a raw ExtractedObservation (strings straight from the LLM) and produces
a cleaned dict matching the `observation` table columns. This is deliberately
plain Python/regex (no LLM calls) so it's deterministic and auditable.
"""
import re
from typing import Optional, Dict, Any

# A small set of common gene/protein alias normalizations. Not exhaustive -
# real projects would use a curated ontology (e.g. HGNC); this demonstrates
# the standardization step without pretending to be a full nomenclature service.
_ENTITY_ALIASES = {
    "brca-1": "BRCA1", "brca 1": "BRCA1", "brca1": "BRCA1",
    "tp-53": "TP53", "tp 53": "TP53", "p53": "TP53",
    "il-6": "IL6", "il 6": "IL6", "il6": "IL6",
}


def clean_text(val: Optional[str]) -> Optional[str]:
    if val is None:
        return None
    val = re.sub(r"\s+", " ", str(val)).strip()
    return val or None


def normalize_entity_name(val: Optional[str]) -> Optional[str]:
    cleaned = clean_text(val)
    if not cleaned:
        return None
    key = cleaned.lower()
    return _ENTITY_ALIASES.get(key, cleaned)


def parse_numeric(val: Optional[str]):
    """Extracts a float from strings like '2.4 fold', '2.4-fold', '2.40-fold increase'.
    Returns (numeric_value_or_None, original_text)."""
    cleaned = clean_text(val)
    if not cleaned:
        return None, None
    m = re.search(r"-?\d+(\.\d+)?", cleaned)
    numeric = float(m.group(0)) if m else None
    return numeric, cleaned


def parse_p_value(val: Optional[str]) -> Optional[float]:
    cleaned = clean_text(val)
    if not cleaned:
        return None
    # handles "p=0.003", "p < 0.001", "0.003"
    m = re.search(r"([<>]=?\s*)?(\d*\.?\d+)(e-?\d+)?", cleaned)
    if not m:
        return None
    try:
        return float(m.group(2) + (m.group(3) or ""))
    except ValueError:
        return None


def parse_int(val: Optional[str]) -> Optional[int]:
    cleaned = clean_text(val)
    if not cleaned:
        return None
    m = re.search(r"\d+", cleaned)
    return int(m.group(0)) if m else None


def normalize_unit(val: Optional[str]) -> Optional[str]:
    cleaned = clean_text(val)
    if not cleaned:
        return None
    u = cleaned.lower().replace("-", " ")
    u = re.sub(r"\s+", " ", u).strip()
    aliases = {
        "fold change": "fold", "fold increase": "fold", "fold": "fold",
        "percent": "%", "percentage": "%",
    }
    return aliases.get(u, cleaned)


def standardize_observation(raw: Dict[str, Any]) -> Dict[str, Any]:
    """raw: dict version of an ExtractedObservation. Returns cleaned dict
    ready for insertion into the `observation` table."""
    value_numeric, value_text = parse_numeric(raw.get("value"))

    return {
        "biological_entity": normalize_entity_name(raw.get("biological_entity")),
        "entity_type": clean_text(raw.get("entity_type")),
        "organism": clean_text(raw.get("organism")),
        "tissue": clean_text(raw.get("tissue")),
        "condition": clean_text(raw.get("condition")),
        "treatment": clean_text(raw.get("treatment")),
        "experimental_group": clean_text(raw.get("experimental_group")),
        "control_group": clean_text(raw.get("control_group")),
        "measured_variable": clean_text(raw.get("measured_variable")),
        "value": value_numeric,
        "value_text": value_text,
        "unit": normalize_unit(raw.get("unit")),
        "sample_size": parse_int(raw.get("sample_size")),
        "p_value": parse_p_value(raw.get("p_value")),
        "effect": clean_text(raw.get("effect")),
        "method": clean_text(raw.get("method")),
        "source_page": raw.get("source_page"),
        "confidence": raw.get("confidence"),
    }
