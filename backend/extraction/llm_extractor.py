"""AI-assisted structured biological observation extraction.

This is NOT a chatbot. We send page-aware text and force the model to
return schema-validated JSON (via a forced function/tool call), which we
then validate with Pydantic. Anything that fails validation is dropped,
not guessed.

Uses Groq's free API (https://console.groq.com) via its OpenAI-compatible
endpoint, so no paid API key is required to run extraction. Swap MODEL or
the client base_url below if you later move to a paid provider - nothing
else in the pipeline needs to change.
"""
import os
from typing import List, Dict
from openai import OpenAI
from models.schemas import ExtractionResult

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "record_observations",
        "description": "Record structured biological research observations extracted from the paper text.",
        "parameters": {
            "type": "object",
            "properties": {
                "observations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "biological_entity": {"type": ["string", "null"]},
                            "entity_type": {"type": ["string", "null"], "description": "gene/protein/biomarker/organism/species/cell_type/other"},
                            "organism": {"type": ["string", "null"]},
                            "tissue": {"type": ["string", "null"]},
                            "condition": {"type": ["string", "null"]},
                            "treatment": {"type": ["string", "null"]},
                            "experimental_group": {"type": ["string", "null"]},
                            "control_group": {"type": ["string", "null"]},
                            "measured_variable": {"type": ["string", "null"]},
                            "value": {"type": ["string", "null"]},
                            "unit": {"type": ["string", "null"]},
                            "sample_size": {"type": ["string", "null"]},
                            "p_value": {"type": ["string", "null"]},
                            "effect": {"type": ["string", "null"]},
                            "method": {"type": ["string", "null"]},
                            "source_page": {"type": ["integer", "null"]},
                            "evidence_quote": {"type": ["string", "null"], "description": "Verbatim sentence(s) copied exactly from the page text"},
                            "confidence": {"type": ["number", "null"], "minimum": 0, "maximum": 1}
                        },
                        "required": ["biological_entity", "source_page", "evidence_quote"]
                    }
                }
            },
            "required": ["observations"]
        }
    }
}

SYSTEM_PROMPT = """You are a biological research data extraction engine, not a conversational assistant.

Read the provided research paper text (given page-by-page) and extract discrete,
structured biological observations: entities (genes/proteins/biomarkers/organisms/
tissues/cell types), experimental conditions/treatments, measured variables and
their values/units/statistics, and reported results.

STRICT RULES:
- Only extract what is explicitly stated in the text. NEVER invent, infer beyond
  the text, or hallucinate values.
- Every observation MUST include the exact source_page it came from and an
  evidence_quote that is copied VERBATIM from that page's text (do not paraphrase).
- If a field is not reported, omit it (use null) rather than guessing.
- One observation = one measured variable / result, tied to one entity and condition.
- Call the record_observations tool exactly once with all observations found.
"""


class ExtractionError(Exception):
    pass


def extract_observations(pages: List[Dict], api_key: str) -> ExtractionResult:
    if not api_key:
        raise ExtractionError("GROQ_API_KEY is not configured.")

    client = OpenAI(api_key=api_key, base_url=GROQ_BASE_URL)

    # Build page-labelled text, chunked to stay within reasonable context.
    doc_text = "\n\n".join(f"[PAGE {p['pageNumber']}]\n{p['text']}" for p in pages if p["text"].strip())
    if not doc_text.strip():
        return ExtractionResult(observations=[])

    doc_text = doc_text[:100000]  # guard rail against oversized docs / free-tier token limits

    try:
        response = client.chat.completions.create(
            model=MODEL,
            max_tokens=4096,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Extract biological observations from this paper:\n\n{doc_text}"},
            ],
            tools=[TOOL_SCHEMA],
            tool_choice={"type": "function", "function": {"name": "record_observations"}},
        )
    except Exception as e:
        raise ExtractionError(f"Groq API call failed: {e}")

    message = response.choices[0].message
    tool_calls = message.tool_calls or []
    if not tool_calls:
        raise ExtractionError("Model did not return structured tool output.")

    import json
    try:
        args = json.loads(tool_calls[0].function.arguments)
        result = ExtractionResult(**args)
    except Exception as e:
        raise ExtractionError(f"Model output failed schema validation: {e}")

    return result
