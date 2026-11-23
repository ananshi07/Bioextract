"""AI-assisted structured biological observation extraction.

This is NOT a chatbot. We send page-aware text and force the model to
return schema-validated JSON (via a forced function/tool call), which we
then validate with Pydantic. Anything that fails validation is dropped,
not guessed.

Uses Groq's OpenAI-compatible endpoint. The selected model must be enabled
for the configured API key; availability and usage costs depend on the account.
"""
import os
from threading import Lock
from typing import List, Dict
from openai import OpenAI
from models.schemas import ExtractionResult

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
MODEL = os.getenv("GROQ_MODEL", "").strip()

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


class ExtractionConfigurationError(ExtractionError):
    pass


class ProviderRequestError(ExtractionError):
    pass


# The rate budget is configurable because Groq limits vary by model and account.
MAX_CHUNK_CHARS = 9000            # ~2250 tokens of document text per chunk
COMPLETION_MAX_TOKENS = 800       # observations are compact JSON; 1500 was more headroom than needed
CHARS_PER_TOKEN_ESTIMATE = 4
FIXED_OVERHEAD_TOKENS = 500       # system prompt + tool schema, roughly
RATE_LIMIT_TPM = int(os.getenv("GROQ_RATE_LIMIT_TPM", "12000"))
RATE_LIMIT_SAFETY_BUDGET = int(RATE_LIMIT_TPM * 0.9)

# Hard ceiling so a pathological paper (huge page count, or garbled/duplicated
# extracted text) fails fast with a clear error instead of running for an
# unbounded amount of time with no feedback.
MAX_CHUNKS = 60
MAX_TOTAL_SECONDS = 600  # 10 minutes

_request_log: List[tuple] = []    # [(timestamp, tokens_used), ...] rolling 60s window
_request_log_lock = Lock()


def _estimate_tokens(doc_text: str) -> int:
    return FIXED_OVERHEAD_TOKENS + len(doc_text) // CHARS_PER_TOKEN_ESTIMATE + COMPLETION_MAX_TOKENS


def _wait_for_rate_budget(next_request_tokens: int) -> None:
    """Keep requests within the configured rolling Groq token budget."""
    import time as _time
    if next_request_tokens > RATE_LIMIT_SAFETY_BUDGET:
        raise ProviderRequestError(
            "A chunk's estimated token use exceeds the configured rate budget. "
            "Increase GROQ_RATE_LIMIT_TPM for your account or reduce MAX_CHUNK_CHARS."
        )

    with _request_log_lock:
        while True:
            now = _time.time()
            _request_log[:] = [(t, n) for t, n in _request_log if now - t < 60]
            used = sum(n for _, n in _request_log)
            if used + next_request_tokens <= RATE_LIMIT_SAFETY_BUDGET:
                _request_log.append((now, next_request_tokens))
                return

            sleep_for = max(1, 60 - (now - _request_log[0][0]) + 1)
            print(f"[extract] rate-limit pacing: {used}/{RATE_LIMIT_SAFETY_BUDGET} tokens used in last 60s, "
                  f"sleeping {sleep_for:.0f}s before next chunk", flush=True)
            _time.sleep(sleep_for)


def _chunk_pages(pages: List[Dict], max_chars: int = MAX_CHUNK_CHARS) -> List[List[Dict]]:
    """Groups page dicts into chunks whose combined text stays under
    max_chars, without ever splitting a page across chunks unless that
    single page alone exceeds max_chars (in which case it's split into
    sub-parts that keep the same pageNumber, so evidence/page verification
    still lines up)."""
    chunks: List[List[Dict]] = []
    current: List[Dict] = []
    current_len = 0

    for p in pages:
        text = p.get("text") or ""
        if not text.strip():
            continue

        if len(text) > max_chars:
            if current:
                chunks.append(current)
                current, current_len = [], 0
            start = 0
            while start < len(text):
                chunks.append([{"pageNumber": p["pageNumber"], "text": text[start:start + max_chars]}])
                start += max_chars
            continue

        if current and current_len + len(text) > max_chars:
            chunks.append(current)
            current, current_len = [], 0

        current.append(p)
        current_len += len(text)

    if current:
        chunks.append(current)

    return chunks


def _extract_chunk(client: OpenAI, chunk: List[Dict]):
    """Runs one chunked API call and returns a list of validated
    ExtractedObservation objects (empty list on a clean 'nothing found')."""
    import json

    doc_text = "\n\n".join(f"[PAGE {p['pageNumber']}]\n{p['text']}" for p in chunk)

    _wait_for_rate_budget(_estimate_tokens(doc_text))

    try:
        response = client.chat.completions.create(
            model=MODEL,
            max_tokens=COMPLETION_MAX_TOKENS,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Extract biological observations from this excerpt:\n\n{doc_text}"},
            ],
            tools=[TOOL_SCHEMA],
            tool_choice={"type": "function", "function": {"name": "record_observations"}},
        )
    except Exception as e:
        status_code = getattr(e, "status_code", None)
        if status_code == 401:
            message = "Groq rejected the API key. Check GROQ_API_KEY."
        elif status_code == 403:
            message = "This Groq API key is not permitted to use the requested model."
        elif status_code == 404:
            message = (
                f"Groq model '{MODEL}' was not found or is unavailable to this API key. "
                "Choose a model enabled for this key in GROQ_MODEL."
            )
        elif status_code == 429:
            message = "Groq rate limit or usage quota was reached. Wait before retrying."
        elif status_code is not None:
            message = f"Groq request failed with HTTP {status_code}; extraction stopped."
        else:
            message = f"Groq API request failed: {e}"
        raise ProviderRequestError(message) from e

    if not response.choices:
        raise ExtractionError("Groq returned no completion choices for a chunk.")

    message = response.choices[0].message
    tool_calls = message.tool_calls or []
    if not tool_calls:
        raise ExtractionError("Model did not return structured tool output for a chunk.")

    try:
        tool_call = tool_calls[0]
        if not tool_call.function or tool_call.function.name != "record_observations":
            raise ExtractionError("Model returned an unexpected tool call for a chunk.")
        args = json.loads(tool_call.function.arguments)
        return ExtractionResult(**args).observations
    except ExtractionError:
        raise
    except Exception as e:
        raise ExtractionError(f"Model output failed schema validation on a chunk: {e}")


def extract_observations(pages: List[Dict], api_key: str) -> ExtractionResult:
    if not api_key:
        raise ExtractionConfigurationError("GROQ_API_KEY is not configured.")
    if not MODEL:
        raise ExtractionConfigurationError(
            "GROQ_MODEL is not configured. Set it to a model enabled for your Groq API key."
        )

    import time as _time
    client = OpenAI(api_key=api_key, base_url=GROQ_BASE_URL)

    chunks = _chunk_pages(pages)
    if not chunks:
        print("[extract] no non-empty page text found - nothing to extract", flush=True)
        return ExtractionResult(observations=[])

    total_chars = sum(len(p["text"]) for c in chunks for p in c)
    print(f"[extract] {len(pages)} pages, {total_chars} chars -> {len(chunks)} sequential chunk(s)", flush=True)

    if len(chunks) > MAX_CHUNKS:
        raise ExtractionError(
            f"This paper split into {len(chunks)} chunks, above the safety limit of {MAX_CHUNKS}. "
            "Try a shorter paper, or split this PDF into smaller sections first."
        )

    all_observations = []
    failed_chunks: List[str] = []
    start_time = _time.time()

    # Sequential on purpose: one chunk finishes (and its tokens clear the
    # TPM window) before the next request is sent, so we don't stack up
    # against Groq's rate limit the way one giant request did.
    for i, chunk in enumerate(chunks, start=1):
        elapsed = _time.time() - start_time
        if elapsed > MAX_TOTAL_SECONDS:
            raise ExtractionError(
                f"Extraction incomplete: stopped after {elapsed:.0f}s, exceeding the "
                f"{MAX_TOTAL_SECONDS}s safety limit ({i-1}/{len(chunks)} chunks completed). "
                "Partial results from this run were not saved."
            )

        pagenums = sorted(set(p["pageNumber"] for p in chunk))
        print(f"[extract] chunk {i}/{len(chunks)} (pages {pagenums}) - sending...", flush=True)
        try:
            observations = _extract_chunk(client, chunk)
            print(f"[extract] chunk {i}/{len(chunks)} -> {len(observations)} observation(s)", flush=True)
            all_observations.extend(observations)
        except ProviderRequestError as e:
            raise ExtractionError(
                f"Extraction stopped on chunk {i}/{len(chunks)} (pages {pagenums}): {e} "
                "Partial results from this run were not saved."
            ) from e
        except ExtractionError as e:
            # Don't let one bad/oversized chunk fail the whole paper -
            # keep processing the remaining chunks, then report the run as incomplete.
            print(f"[extract] chunk {i}/{len(chunks)} FAILED: {e}", flush=True)
            failed_chunks.append(f"chunk {i} (pages {pagenums}): {e}")
            continue

    print(f"[extract] done in {_time.time() - start_time:.0f}s - {len(all_observations)} total observation(s)", flush=True)

    if failed_chunks:
        raise ExtractionError(
            f"Extraction incomplete: {len(failed_chunks)} of {len(chunks)} chunk(s) failed. "
            "Partial results from this run were not saved. " + "; ".join(failed_chunks)
        )

    return ExtractionResult(observations=all_observations)