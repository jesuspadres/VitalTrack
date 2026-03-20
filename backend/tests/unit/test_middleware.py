"""Unit tests for auth and error_handler middleware.

Covers user-ID extraction from Cognito claims, tenant isolation enforcement,
and the error_handler decorator's behaviour for domain and unexpected errors.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock

import pytest

from src.middleware.auth import enforce_user_isolation, extract_user_id
from src.middleware.error_handler import error_handler
from src.shared.exceptions import (
    AuthorizationError,
    NotFoundError,
    ValidationError,
    VitalTrackError,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_event(
    user_id: str | None = None,
    request_id: str = "test-req-id",
) -> dict[str, Any]:
    """Build a minimal API Gateway event with optional Cognito claims."""
    claims: dict[str, Any] = {}
    if user_id is not None:
        claims["sub"] = user_id

    return {
        "httpMethod": "GET",
        "path": "/v1/test",
        "headers": {},
        "requestContext": {
            "requestId": request_id,
            "authorizer": {
                "claims": claims,
            },
        },
    }


# ---------------------------------------------------------------------------
# extract_user_id
# ---------------------------------------------------------------------------


class TestExtractUserId:
    def test_extract_user_id_success(self) -> None:
        """Extracts the sub claim from a properly formed event."""
        user_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        event = _build_event(user_id=user_id)
        assert extract_user_id(event) == user_id

    def test_extract_user_id_missing(self) -> None:
        """Raises ValidationError when the sub claim is absent."""
        event = _build_event(user_id=None)
        with pytest.raises(ValidationError, match="Missing authenticated user"):
            extract_user_id(event)

    def test_extract_user_id_empty_request_context(self) -> None:
        """Raises ValidationError when requestContext is empty."""
        event: dict[str, Any] = {
            "httpMethod": "GET",
            "path": "/v1/test",
            "headers": {},
            "requestContext": {},
        }
        with pytest.raises(ValidationError, match="Missing authenticated user"):
            extract_user_id(event)

    def test_extract_user_id_no_authorizer(self) -> None:
        """Raises ValidationError when the authorizer key is missing."""
        event: dict[str, Any] = {
            "httpMethod": "GET",
            "path": "/v1/test",
            "headers": {},
            "requestContext": {"requestId": "req-1"},
        }
        with pytest.raises(ValidationError):
            extract_user_id(event)


# ---------------------------------------------------------------------------
# enforce_user_isolation
# ---------------------------------------------------------------------------


class TestEnforceUserIsolation:
    def test_enforce_user_isolation_match(self) -> None:
        """No exception is raised when the user IDs match."""
        user_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        # Should complete silently
        enforce_user_isolation(user_id, user_id)

    def test_enforce_user_isolation_mismatch(self) -> None:
        """Raises AuthorizationError when the user IDs differ."""
        user_a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        user_b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
        with pytest.raises(AuthorizationError, match="not authorized"):
            enforce_user_isolation(user_a, user_b)


# ---------------------------------------------------------------------------
# error_handler decorator
# ---------------------------------------------------------------------------


class TestErrorHandler:
    def _make_decorated_handler(
        self, side_effect: Exception | None = None, return_value: dict[str, Any] | None = None
    ):
        """Create a Lambda handler wrapped with @error_handler.

        If *side_effect* is given the handler will raise it.
        Otherwise it returns *return_value*.
        """
        logger = MagicMock()

        @error_handler(logger)
        def _handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
            if side_effect is not None:
                raise side_effect
            return return_value or {"statusCode": 200, "body": "ok"}

        return _handler

    def test_error_handler_catches_domain_error(self) -> None:
        """VitalTrackError subclass is serialised into the standard envelope."""
        exc = NotFoundError(message="Thing not found.")
        handler_fn = self._make_decorated_handler(side_effect=exc)

        event = _build_event(user_id="u1")
        response = handler_fn(event, None)

        assert response["statusCode"] == 404
        body = json.loads(response["body"])
        assert body["success"] is False
        assert body["error"]["code"] == "NOT_FOUND"
        assert body["error"]["message"] == "Thing not found."
        assert "meta" in body
        assert body["meta"]["requestId"] == "test-req-id"

    def test_error_handler_catches_validation_error(self) -> None:
        """ValidationError returns 400 with proper envelope."""
        exc = ValidationError(message="Bad input.")
        handler_fn = self._make_decorated_handler(side_effect=exc)

        event = _build_event(user_id="u1")
        response = handler_fn(event, None)

        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert body["success"] is False
        assert body["error"]["code"] == "VALIDATION_ERROR"

    def test_error_handler_catches_unexpected(self) -> None:
        """Non-VitalTrackError exceptions return a sanitised 500 response."""
        exc = RuntimeError("boom")
        handler_fn = self._make_decorated_handler(side_effect=exc)

        event = _build_event(user_id="u1")
        response = handler_fn(event, None)

        assert response["statusCode"] == 500
        body = json.loads(response["body"])
        assert body["success"] is False
        assert body["error"]["code"] == "INTERNAL_ERROR"
        # The original message should NOT leak to the client
        assert "boom" not in body["error"]["message"]

    def test_error_handler_passes_through_success(self) -> None:
        """When the handler succeeds, its response is returned unchanged."""
        handler_fn = self._make_decorated_handler(
            return_value={"statusCode": 200, "body": '{"ok": true}'}
        )

        event = _build_event(user_id="u1")
        response = handler_fn(event, None)

        assert response["statusCode"] == 200
        assert response["body"] == '{"ok": true}'
