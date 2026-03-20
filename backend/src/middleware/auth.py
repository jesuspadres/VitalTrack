"""Authentication and authorisation middleware for VitalTrack Lambda handlers.

Extracts the authenticated ``userId`` from the Cognito authorizer claims
injected by API Gateway and enforces tenant data isolation.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import wraps
from typing import Any

from shared.exceptions import AuthorizationError, ValidationError


def extract_user_id(event: dict[str, Any]) -> str:
    """Extract the Cognito ``sub`` (userId) from an API Gateway event.

    The value lives at ``event.requestContext.authorizer.claims.sub`` for a
    Cognito User Pool authorizer on REST API Gateway (v1).

    Raises ``ValidationError`` if the claims are missing or ``sub`` is absent.
    """
    request_context: dict[str, Any] = event.get("requestContext") or {}
    authorizer: dict[str, Any] = request_context.get("authorizer") or {}
    claims: dict[str, Any] = authorizer.get("claims") or {}
    user_id: str | None = claims.get("sub")

    if not user_id:
        raise ValidationError(
            message="Missing authenticated user identity.",
            details=[{"field": "authorization", "issue": "Cognito sub claim not found"}],
        )
    return user_id


def require_auth(
    func: Callable[..., dict[str, Any]],
) -> Callable[..., dict[str, Any]]:
    """Decorator that extracts the userId from the event and passes it to the
    wrapped handler as the first positional argument after ``event``.

    The decorated handler signature should be::

        def handler(event: dict, context: Any, user_id: str) -> dict:
            ...

    Usage::

        @require_auth
        def handler(event, context, user_id):
            ...
    """

    @wraps(func)
    def wrapper(
        event: dict[str, Any],
        context: Any,
    ) -> dict[str, Any]:
        user_id = extract_user_id(event)
        return func(event, context, user_id)

    return wrapper


def enforce_user_isolation(user_id: str, resource_user_id: str) -> None:
    """Raise ``AuthorizationError`` when *user_id* does not match the owner of
    the requested resource.

    This is the query-guard pattern described in the security architecture:
    every data-plane operation must verify that the authenticated user is the
    owner of the target record.
    """
    if user_id != resource_user_id:
        raise AuthorizationError(
            message="You are not authorized to access this resource.",
        )
