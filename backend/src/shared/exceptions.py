"""Custom exception hierarchy for VitalTrack.

Every exception carries a machine-readable code, a human-readable message,
an HTTP status code, and optional structured details so the error_handler
middleware can produce a consistent API error envelope.
"""

from __future__ import annotations

from typing import Any

from src.shared.constants import (
    HTTP_400_BAD_REQUEST,
    HTTP_403_FORBIDDEN,
    HTTP_404_NOT_FOUND,
    HTTP_409_CONFLICT,
    HTTP_429_TOO_MANY_REQUESTS,
    HTTP_500_INTERNAL_SERVER_ERROR,
    HTTP_502_BAD_GATEWAY,
)


class VitalTrackError(Exception):
    """Base exception for all VitalTrack domain errors."""

    def __init__(
        self,
        *,
        code: str = "INTERNAL_ERROR",
        message: str = "An unexpected error occurred.",
        status_code: int = HTTP_500_INTERNAL_SERVER_ERROR,
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details: list[dict[str, Any]] = details or []

    def to_dict(self) -> dict[str, Any]:
        """Serialise the error for the API response envelope."""
        payload: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
        }
        if self.details:
            payload["details"] = self.details
        return payload


class ValidationError(VitalTrackError):
    """Raised when request data fails validation (400)."""

    def __init__(
        self,
        message: str = "Validation failed.",
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            code="VALIDATION_ERROR",
            message=message,
            status_code=HTTP_400_BAD_REQUEST,
            details=details,
        )


class NotFoundError(VitalTrackError):
    """Raised when a requested resource does not exist (404)."""

    def __init__(
        self,
        message: str = "Resource not found.",
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            code="NOT_FOUND",
            message=message,
            status_code=HTTP_404_NOT_FOUND,
            details=details,
        )


class AuthorizationError(VitalTrackError):
    """Raised when a user attempts to access a resource they do not own (403)."""

    def __init__(
        self,
        message: str = "You are not authorized to access this resource.",
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            code="AUTHORIZATION_ERROR",
            message=message,
            status_code=HTTP_403_FORBIDDEN,
            details=details,
        )


class ConflictError(VitalTrackError):
    """Raised when a write conflicts with existing state (409)."""

    def __init__(
        self,
        message: str = "Resource conflict.",
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            code="CONFLICT",
            message=message,
            status_code=HTTP_409_CONFLICT,
            details=details,
        )


class RateLimitError(VitalTrackError):
    """Raised when a caller exceeds the allowed request rate (429)."""

    def __init__(
        self,
        message: str = "Rate limit exceeded. Please try again later.",
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            code="RATE_LIMIT_EXCEEDED",
            message=message,
            status_code=HTTP_429_TOO_MANY_REQUESTS,
            details=details,
        )


class InternalError(VitalTrackError):
    """Raised for unexpected internal failures (500)."""

    def __init__(
        self,
        message: str = "An internal error occurred.",
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            code="INTERNAL_ERROR",
            message=message,
            status_code=HTTP_500_INTERNAL_SERVER_ERROR,
            details=details,
        )


class BedrockError(VitalTrackError):
    """Raised when Amazon Bedrock invocation fails (502)."""

    def __init__(
        self,
        message: str = "AI service is temporarily unavailable.",
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            code="BEDROCK_ERROR",
            message=message,
            status_code=HTTP_502_BAD_GATEWAY,
            details=details,
        )
