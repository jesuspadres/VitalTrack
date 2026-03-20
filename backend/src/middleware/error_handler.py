"""Lambda error-handler decorator.

Wraps any Lambda handler so that:
- ``VitalTrackError`` subtypes are serialised into the standard error envelope
  with the correct HTTP status code.
- Unexpected exceptions are caught, logged, and returned as a sanitised 500.
"""

from __future__ import annotations

import json
import traceback
from collections.abc import Callable
from datetime import datetime, timezone
from functools import wraps
from typing import Any

from aws_lambda_powertools import Logger

from pydantic import ValidationError as PydanticValidationError

from src.shared.constants import HTTP_400_BAD_REQUEST, HTTP_500_INTERNAL_SERVER_ERROR
from src.shared.exceptions import VitalTrackError


def _build_error_response(
    status_code: int,
    error_body: dict[str, Any],
    request_id: str,
) -> dict[str, Any]:
    """Construct the standard API Gateway proxy-integration error response."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "X-Request-Id": request_id,
        },
        "body": json.dumps(
            {
                "success": False,
                "error": error_body,
                "meta": {
                    "requestId": request_id,
                    "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                },
            }
        ),
    }


def error_handler(logger: Logger) -> Callable[..., Any]:
    """Return a decorator that wraps a Lambda handler with consistent error
    handling and logging.

    Usage::

        logger = get_logger("my-service")

        @error_handler(logger)
        def handler(event, context):
            ...
    """

    def decorator(
        func: Callable[..., dict[str, Any]],
    ) -> Callable[..., dict[str, Any]]:
        @wraps(func)
        def wrapper(
            event: dict[str, Any],
            context: Any,
        ) -> dict[str, Any]:
            request_context: dict[str, Any] = event.get("requestContext") or {}
            request_id: str = request_context.get("requestId", "unknown")

            try:
                return func(event, context)

            except VitalTrackError as exc:
                logger.warning(
                    "Domain error",
                    extra={
                        "error_code": exc.code,
                        "error_message": exc.message,
                        "status_code": exc.status_code,
                        "details": exc.details,
                        "request_id": request_id,
                    },
                )
                return _build_error_response(
                    status_code=exc.status_code,
                    error_body=exc.to_dict(),
                    request_id=request_id,
                )

            except PydanticValidationError as exc:
                logger.warning(
                    "Pydantic validation error",
                    extra={
                        "error_count": exc.error_count(),
                        "request_id": request_id,
                    },
                )
                return _build_error_response(
                    status_code=HTTP_400_BAD_REQUEST,
                    error_body={
                        "code": "VALIDATION_ERROR",
                        "message": "Request validation failed.",
                        "details": [
                            {"field": str(e["loc"]), "issue": e["msg"]}
                            for e in exc.errors()
                        ],
                    },
                    request_id=request_id,
                )

            except Exception:
                logger.error(
                    "Unhandled exception",
                    extra={
                        "request_id": request_id,
                        "traceback": traceback.format_exc(),
                    },
                )
                return _build_error_response(
                    status_code=HTTP_500_INTERNAL_SERVER_ERROR,
                    error_body={
                        "code": "INTERNAL_ERROR",
                        "message": "An unexpected error occurred.",
                    },
                    request_id=request_id,
                )

        return wrapper

    return decorator
