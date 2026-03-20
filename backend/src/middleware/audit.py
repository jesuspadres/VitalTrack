"""Audit logging middleware for VitalTrack.

Writes immutable audit records to the dedicated DynamoDB audit table. Every
data-plane operation (read, write, delete) and significant event (login,
insight generation) produces an audit entry.

IP addresses are hashed with SHA-256 before storage to avoid retaining raw
PII while still allowing correlation of requests from the same source.
"""

from __future__ import annotations

import hashlib
import time
from datetime import datetime, timezone
from enum import StrEnum
from typing import TYPE_CHECKING, Any

import boto3

if TYPE_CHECKING:
    from mypy_boto3_dynamodb.service_resource import Table

from config.settings import get_settings
from middleware.logging_config import get_logger

logger = get_logger("audit")

# Audit records expire after 365 days
_AUDIT_TTL_DAYS: int = 365


class AuditEventType(StrEnum):
    """Auditable event categories."""

    LOGIN = "LOGIN"
    DATA_ACCESS = "DATA_ACCESS"
    DATA_WRITE = "DATA_WRITE"
    DATA_DELETE = "DATA_DELETE"
    INSIGHT_GENERATED = "INSIGHT_GENERATED"


def _hash_ip(ip_address: str) -> str:
    """Return the SHA-256 hex digest of *ip_address*."""
    return hashlib.sha256(ip_address.encode("utf-8")).hexdigest()


def _get_audit_table() -> Table:
    """Return the DynamoDB Table resource for the audit log."""
    settings = get_settings()
    dynamodb = boto3.resource("dynamodb")
    return dynamodb.Table(settings.audit_table)


def log_audit_event(
    *,
    user_id: str,
    event_type: AuditEventType,
    resource_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Persist a single audit record to the audit DynamoDB table.

    Args:
        user_id: Cognito ``sub`` of the acting user.
        event_type: The category of auditable event.
        resource_id: Optional identifier of the affected resource.
        ip_address: Source IP; will be SHA-256 hashed before storage.
        user_agent: Truncated ``User-Agent`` header value.
    """
    now = datetime.now(tz=timezone.utc)
    timestamp_iso = now.isoformat()
    ttl = int(time.time()) + (_AUDIT_TTL_DAYS * 86_400)

    item: dict[str, Any] = {
        "pk": f"AUDIT#{user_id}",
        "sk": f"#{timestamp_iso}#{event_type.value}",
        "eventType": event_type.value,
        "timestamp": timestamp_iso,
        "ttl": ttl,
    }

    if resource_id is not None:
        item["resourceId"] = resource_id

    if ip_address is not None:
        item["ipAddress"] = _hash_ip(ip_address)

    if user_agent is not None:
        # Truncate to a reasonable length to avoid unbounded storage
        item["userAgent"] = user_agent[:512]

    try:
        table = _get_audit_table()
        table.put_item(Item=item)
    except Exception:
        # Audit writes must never block the primary request path. Log the
        # failure and continue so the caller is not impacted.
        logger.exception("Failed to write audit event", extra={"audit_item": item})
