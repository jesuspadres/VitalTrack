"""Lambda handler for AI insight generation via Amazon Bedrock.

This is the inference step in the Step Functions insight-generation workflow.
It receives biomarker history and current results from the fetch_history step,
renders the Jinja2 prompt template, invokes Bedrock (Claude), and validates
the response against the InsightResponse Pydantic model.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import boto3
import jinja2
from botocore.exceptions import ClientError
from pydantic import ValidationError as PydanticValidationError

from src.config.settings import get_settings
from src.middleware.logging_config import get_logger
from src.models.insight import InsightResponse
from src.shared.exceptions import BedrockError

logger = get_logger("insight-generate")
settings = get_settings()

_PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts"
_PROMPT_TEMPLATE = "insight_v1.jinja2"
_PROMPT_VERSION = "v1"

_jinja_env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(_PROMPT_DIR)),
    autoescape=False,
    keep_trailing_newline=True,
)

_bedrock_client: Any = None


def _get_bedrock_client() -> Any:
    global _bedrock_client  # noqa: PLW0603
    if _bedrock_client is None:
        _bedrock_client = boto3.client("bedrock-runtime")
    return _bedrock_client


def _get_model_id() -> str:
    return getattr(
        settings,
        "bedrock_model_id",
        "anthropic.claude-3-5-sonnet-20241022-v2:0",
    )


def _strip_code_fences(text: str) -> str:
    """Remove markdown code fences that Claude sometimes wraps around JSON."""
    stripped = text.strip()
    stripped = re.sub(r"^```(?:json)?\s*\n?", "", stripped)
    stripped = re.sub(r"\n?```\s*$", "", stripped)
    return stripped.strip()


def _render_prompt(
    biomarker_history: dict[str, Any],
    current_results: list[dict[str, Any]],
) -> str:
    template = _jinja_env.get_template(_PROMPT_TEMPLATE)
    return template.render(
        biomarker_history=biomarker_history,
        current_results=current_results,
    )


def _invoke_bedrock(prompt: str, model_id: str) -> str:
    """Send a prompt to Bedrock and return the raw text response."""
    client = _get_bedrock_client()
    try:
        response = client.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 4096,
                "messages": [{"role": "user", "content": prompt}],
            }),
        )
    except ClientError as exc:
        logger.error(
            "Bedrock invocation failed",
            extra={"error": str(exc), "model_id": model_id},
        )
        raise BedrockError(
            message=f"Bedrock invocation failed: {exc}",
            details=[{"error": str(exc), "modelId": model_id}],
        ) from exc

    response_body = json.loads(response["body"].read())
    return response_body["content"][0]["text"]


def _parse_and_validate(raw_text: str) -> InsightResponse:
    """Parse raw Bedrock text as JSON and validate against InsightResponse."""
    cleaned = _strip_code_fences(raw_text)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error(
            "Failed to parse Bedrock response as JSON",
            extra={"error": str(exc), "raw_text": raw_text[:500]},
        )
        raise BedrockError(
            message="Bedrock response is not valid JSON.",
            details=[{"error": str(exc)}],
        ) from exc

    try:
        return InsightResponse.model_validate(data)
    except PydanticValidationError as exc:
        logger.warning(
            "Validation failed on first attempt",
            extra={"errors": exc.error_count()},
        )
        raise exc


def _retry_with_correction(
    raw_text: str,
    validation_error: PydanticValidationError,
    model_id: str,
) -> InsightResponse:
    """Re-invoke Bedrock with a simplified error-correction prompt."""
    error_summary = "; ".join(
        f"{e['loc']}: {e['msg']}" for e in validation_error.errors()
    )
    correction_prompt = (
        "The following JSON response had validation errors. "
        "Please fix the errors and return ONLY the corrected JSON with no "
        "additional text or markdown formatting.\n\n"
        f"Original response:\n{raw_text}\n\n"
        f"Validation errors:\n{error_summary}\n\n"
        "Return the corrected JSON now."
    )

    logger.info("Retrying Bedrock with error-correction prompt")
    corrected_text = _invoke_bedrock(correction_prompt, model_id)
    cleaned = _strip_code_fences(corrected_text)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error(
            "Correction response is not valid JSON",
            extra={"error": str(exc)},
        )
        raise BedrockError(
            message="Bedrock correction response is not valid JSON.",
            details=[{"error": str(exc)}],
        ) from exc

    try:
        return InsightResponse.model_validate(data)
    except PydanticValidationError as exc:
        logger.error(
            "Validation failed after correction retry",
            extra={"errors": exc.error_count()},
        )
        raise BedrockError(
            message="Bedrock response failed validation after retry.",
            details=[{"error": str(e)} for e in exc.errors()],
        ) from exc


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Step Functions task handler: generate AI insight from biomarker data.

    Expects the output of the insight_fetch_history step as input and returns
    the validated insight payload for downstream persistence.
    """
    user_id: str = event["userId"]
    batch_id: str = event["batchId"]
    biomarker_history: dict[str, Any] = event["biomarkerHistory"]
    current_results: list[dict[str, Any]] = event["currentResults"]

    logger.info(
        "Generating insight",
        extra={
            "user_id": user_id,
            "batch_id": batch_id,
            "biomarker_count": event.get("biomarkerCount"),
        },
    )

    model_id = _get_model_id()
    prompt = _render_prompt(biomarker_history, current_results)

    logger.info(
        "Invoking Bedrock",
        extra={"model_id": model_id, "prompt_length": len(prompt)},
    )
    raw_text = _invoke_bedrock(prompt, model_id)

    # Validate the response, retrying once on validation failure
    try:
        insight = _parse_and_validate(raw_text)
    except PydanticValidationError as exc:
        insight = _retry_with_correction(raw_text, exc, model_id)

    logger.info(
        "Insight generated successfully",
        extra={"user_id": user_id, "batch_id": batch_id, "overall_score": insight.overall_score},
    )

    return {
        "userId": user_id,
        "batchId": batch_id,
        "insight": insight.model_dump(by_alias=True),
        "modelId": model_id,
        "promptVersion": _PROMPT_VERSION,
    }
