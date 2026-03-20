"""Structured JSON logging configuration using AWS Lambda Powertools.

Provides a ``get_logger`` factory that returns a pre-configured Powertools
Logger instance with correlation-ID injection from API Gateway events.
"""

from __future__ import annotations

from typing import Any

from aws_lambda_powertools import Logger


def get_logger(service_name: str) -> Logger:
    """Return a Powertools Logger configured for structured JSON output.

    Args:
        service_name: Logical service name (e.g. ``"biomarker-crud"``).
                      Appears in every log record under the ``service`` key.
    """
    return Logger(
        service=service_name,
        log_uncaught_exceptions=True,
    )


def inject_correlation_id(logger: Logger, event: dict[str, Any]) -> None:
    """Append the API Gateway request ID as a correlation ID to every
    subsequent log entry produced by *logger*.

    The ID is extracted from ``event.requestContext.requestId`` (REST API
    Gateway v1 format).  If the header ``X-Correlation-Id`` is present it
    takes precedence, allowing callers to propagate a trace across services.
    """
    headers: dict[str, str] = event.get("headers") or {}
    # Normalise header keys to lowercase for case-insensitive lookup
    lower_headers = {k.lower(): v for k, v in headers.items()}
    correlation_id: str | None = lower_headers.get("x-correlation-id")

    if not correlation_id:
        request_context: dict[str, Any] = event.get("requestContext") or {}
        correlation_id = request_context.get("requestId", "unknown")

    logger.append_keys(correlation_id=correlation_id)
