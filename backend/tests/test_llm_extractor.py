import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from extraction import llm_extractor


class ExtractObservationsTests(unittest.TestCase):
    def test_timeout_raises_instead_of_returning_empty_success(self):
        with (
            patch.object(llm_extractor, "MODEL", "test/model"),
            patch.object(llm_extractor, "MAX_TOTAL_SECONDS", -1),
            patch.object(llm_extractor, "OpenAI"),
            patch.object(llm_extractor, "_extract_chunk") as extract_chunk,
        ):
            with self.assertRaisesRegex(llm_extractor.ExtractionError, "0/1 chunks completed"):
                llm_extractor.extract_observations(
                    [{"pageNumber": 1, "text": "some text"}],
                    "test-key",
                )

        extract_chunk.assert_not_called()

    def test_chunk_failure_raises_even_if_other_chunks_succeed(self):
        with (
            patch.object(llm_extractor, "MODEL", "test/model"),
            patch.object(
                llm_extractor,
                "_chunk_pages",
                return_value=[
                    [{"pageNumber": 1, "text": "one"}],
                    [{"pageNumber": 2, "text": "two"}],
                ],
            ),
            patch.object(llm_extractor, "MAX_TOTAL_SECONDS", 600),
            patch.object(llm_extractor, "OpenAI"),
            patch.object(
                llm_extractor,
                "_extract_chunk",
                side_effect=[[], llm_extractor.ExtractionError("provider failed")],
            ),
        ):
            with self.assertRaisesRegex(
                llm_extractor.ExtractionError,
                "1 of 2 chunk\\(s\\) failed.*provider failed",
            ):
                llm_extractor.extract_observations(
                    [
                        {"pageNumber": 1, "text": "one"},
                        {"pageNumber": 2, "text": "two"},
                    ],
                    "test-key",
                )

    def test_unavailable_model_stops_before_requesting_remaining_chunks(self):
        provider_error = Exception("model_not_found")
        provider_error.status_code = 404
        create = Mock(side_effect=provider_error)
        client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

        with (
            patch.object(llm_extractor, "MODEL", "test/model"),
            patch.object(
                llm_extractor,
                "_chunk_pages",
                return_value=[
                    [{"pageNumber": 1, "text": "one"}],
                    [{"pageNumber": 2, "text": "two"}],
                ],
            ),
            patch.object(llm_extractor, "OpenAI", return_value=client),
            patch.object(llm_extractor, "MAX_TOTAL_SECONDS", 600),
        ):
            with self.assertRaisesRegex(
                llm_extractor.ExtractionError,
                "1/2.*not found or is unavailable",
            ):
                llm_extractor.extract_observations(
                    [{"pageNumber": 1, "text": "one"}],
                    "test-key",
                )

        create.assert_called_once()

    def test_missing_model_fails_before_client_creation(self):
        with (
            patch.object(llm_extractor, "MODEL", ""),
            patch.object(llm_extractor, "OpenAI") as openai_client,
        ):
            with self.assertRaisesRegex(
                llm_extractor.ExtractionConfigurationError,
                "GROQ_MODEL is not configured",
            ):
                llm_extractor.extract_observations(
                    [{"pageNumber": 1, "text": "some text"}],
                    "test-key",
                )

        openai_client.assert_not_called()

    def test_empty_provider_response_is_reported_as_extraction_error(self):
        client = SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(
                    create=Mock(return_value=SimpleNamespace(choices=[]))
                )
            )
        )

        with patch.object(llm_extractor, "_wait_for_rate_budget"):
            with self.assertRaisesRegex(llm_extractor.ExtractionError, "no completion choices"):
                llm_extractor._extract_chunk(
                    client,
                    [{"pageNumber": 1, "text": "some text"}],
                )


if __name__ == "__main__":
    unittest.main()
