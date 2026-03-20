"""Lambda handler for biomarker CRUD operations, profile management, and health checks.

Routes requests based on HTTP method and path. All data operations enforce
tenant isolation by extracting userId from the Cognito JWT claims.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, Any
from urllib.parse import unquote

import boto3

if TYPE_CHECKING:
    from mypy_boto3_dynamodb.service_resource import Table

from config.settings import get_settings
from middleware.auth import enforce_user_isolation, extract_user_id
from middleware.audit import AuditEventType, log_audit_event
from middleware.error_handler import error_handler
from middleware.logging_config import get_logger, inject_correlation_id
from models.biomarker import (
    BatchCreateRequest,
    CreateBiomarkerRequest,
    UpdateBiomarkerRequest,
)
from shared.constants import BiomarkerStatus
from shared.exceptions import NotFoundError, ValidationError
from shared.validators import validate_biomarker_value

logger = get_logger("biomarker-crud")
settings = get_settings()

_dynamodb = boto3.resource("dynamodb")
_table: Table | None = None


def _get_table() -> Table:
    global _table  # noqa: PLW0603
    if _table is None:
        _table = _dynamodb.Table(settings.biomarkers_table)
    return _table


# ─── Response helpers ───────────────────────────────────────────


def _success(
    data: Any,
    status_code: int = 200,
    request_id: str = "unknown",
    pagination: dict[str, Any] | None = None,
) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "requestId": request_id,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    }
    if pagination:
        meta["pagination"] = pagination

    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "X-Request-Id": request_id,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        "body": json.dumps({"success": True, "data": data, "meta": meta}, default=_decimal_default),
    }


def _decimal_default(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _get_request_id(event: dict[str, Any]) -> str:
    return (event.get("requestContext") or {}).get("requestId", "unknown")


def _get_ip(event: dict[str, Any]) -> str:
    identity = (event.get("requestContext") or {}).get("identity") or {}
    return identity.get("sourceIp", "unknown")


def _get_user_agent(event: dict[str, Any]) -> str:
    headers = event.get("headers") or {}
    return headers.get("User-Agent", headers.get("user-agent", "unknown"))


# ─── Main router ────────────────────────────────────────────────


@error_handler(logger)
def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    inject_correlation_id(logger, event)
    logger.info("Incoming request", extra={"path": event.get("path"), "method": event.get("httpMethod")})

    method = event.get("httpMethod", "")
    path = event.get("path", "")
    request_id = _get_request_id(event)

    # Health check — no auth required
    if path == "/health":
        return _success({"status": "healthy", "service": "vitaltrack"}, request_id=request_id)

    # All other routes require authentication
    user_id = extract_user_id(event)
    path_params = event.get("pathParameters") or {}

    # ── Profile routes ───────────────────────────────────────
    if "/profile" in path:
        if method == "GET":
            return _handle_get_profile(user_id, request_id, event)
        if method == "PUT":
            return _handle_update_profile(user_id, request_id, event)

    # ── Biomarker batch ──────────────────────────────────────
    if path.endswith("/batch") and method == "POST":
        return _handle_batch_create(user_id, request_id, event)

    # ── Biomarker item routes ────────────────────────────────
    sk = unquote(path_params.get("sk", "")) if path_params.get("sk") else None
    if sk:
        if method == "GET":
            return _handle_get_biomarker(user_id, sk, request_id, event)
        if method == "PUT":
            return _handle_update_biomarker(user_id, sk, request_id, event)
        if method == "DELETE":
            return _handle_delete_biomarker(user_id, sk, request_id, event)

    # ── Biomarker collection routes ──────────────────────────
    if method == "POST":
        return _handle_create_biomarker(user_id, request_id, event)
    if method == "GET":
        return _handle_list_biomarkers(user_id, request_id, event)

    raise ValidationError(message=f"Unsupported route: {method} {path}")


# ─── Biomarker handlers ────────────────────────────────────────


def _handle_create_biomarker(
    user_id: str, request_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    body = json.loads(event.get("body") or "{}")
    req = CreateBiomarkerRequest.model_validate(body)
    now = datetime.now(tz=timezone.utc).isoformat()

    status = validate_biomarker_value(req.biomarker_type.value, req.value)

    from shared.validators import get_biomarker_ranges

    ranges = get_biomarker_ranges()
    ref = ranges.get(req.biomarker_type.value, {})

    sk = f"BIOMARKER#{now}#{req.biomarker_type.value}"
    item: dict[str, Any] = {
        "userId": user_id,
        "sk": sk,
        "entityType": "BIOMARKER",
        "biomarkerType": req.biomarker_type.value,
        "value": Decimal(str(req.value)),
        "unit": req.unit,
        "referenceRangeLow": Decimal(str(ref.get("optimalLow", 0))),
        "referenceRangeHigh": Decimal(str(ref.get("optimalHigh", 0))),
        "status": status.value,
        "source": req.source.value,
        "createdAt": now,
    }

    _get_table().put_item(Item=item)

    log_audit_event(
        user_id=user_id,
        event_type=AuditEventType.DATA_WRITE,
        resource_id=sk,
        ip_address=_get_ip(event),
        user_agent=_get_user_agent(event),
    )

    logger.info("Biomarker created", extra={"sk": sk, "type": req.biomarker_type.value})
    return _success(item, status_code=201, request_id=request_id)


def _handle_get_biomarker(
    user_id: str, sk: str, request_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    result = _get_table().get_item(Key={"userId": user_id, "sk": sk})
    item = result.get("Item")

    if not item:
        raise NotFoundError(message=f"Biomarker with key '{sk}' not found.")

    enforce_user_isolation(user_id, item["userId"])

    log_audit_event(
        user_id=user_id,
        event_type=AuditEventType.DATA_ACCESS,
        resource_id=sk,
        ip_address=_get_ip(event),
        user_agent=_get_user_agent(event),
    )

    return _success(item, request_id=request_id)


def _handle_list_biomarkers(
    user_id: str, request_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    query_params = event.get("queryStringParameters") or {}
    limit = min(int(query_params.get("limit", "50")), 100)
    next_token = query_params.get("nextToken")
    biomarker_type = query_params.get("type")

    kwargs: dict[str, Any] = {
        "KeyConditionExpression": boto3.dynamodb.conditions.Key("userId").eq(user_id)
        & boto3.dynamodb.conditions.Key("sk").begins_with("BIOMARKER#"),
        "Limit": limit,
        "ScanIndexForward": False,
    }

    if biomarker_type:
        kwargs["FilterExpression"] = boto3.dynamodb.conditions.Attr("biomarkerType").eq(
            biomarker_type
        )

    if next_token:
        kwargs["ExclusiveStartKey"] = json.loads(
            __import__("base64").b64decode(next_token).decode()
        )

    result = _get_table().query(**kwargs)
    items = result.get("Items", [])

    pagination: dict[str, Any] = {"limit": limit, "nextToken": None}
    last_key = result.get("LastEvaluatedKey")
    if last_key:
        import base64

        pagination["nextToken"] = base64.b64encode(
            json.dumps(last_key, default=_decimal_default).encode()
        ).decode()

    log_audit_event(
        user_id=user_id,
        event_type=AuditEventType.DATA_ACCESS,
        resource_id="biomarkers:list",
        ip_address=_get_ip(event),
        user_agent=_get_user_agent(event),
    )

    return _success(items, request_id=request_id, pagination=pagination)


def _handle_update_biomarker(
    user_id: str, sk: str, request_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    body = json.loads(event.get("body") or "{}")
    req = UpdateBiomarkerRequest.model_validate(body)

    if req.value is None and req.unit is None:
        raise ValidationError(message="At least one field (value or unit) must be provided.")

    # Verify the record exists and belongs to this user
    existing = _get_table().get_item(Key={"userId": user_id, "sk": sk})
    item = existing.get("Item")
    if not item:
        raise NotFoundError(message=f"Biomarker with key '{sk}' not found.")
    enforce_user_isolation(user_id, item["userId"])

    update_expr_parts: list[str] = []
    expr_values: dict[str, Any] = {}

    if req.value is not None:
        update_expr_parts.append("#val = :val")
        expr_values[":val"] = Decimal(str(req.value))

        # Recalculate status
        biomarker_type = item["biomarkerType"]
        new_status = validate_biomarker_value(biomarker_type, req.value)
        update_expr_parts.append("#status = :status")
        expr_values[":status"] = new_status.value

    if req.unit is not None:
        update_expr_parts.append("#unit = :unit")
        expr_values[":unit"] = req.unit

    expr_names: dict[str, str] = {"#val": "value", "#status": "status", "#unit": "unit"}

    result = _get_table().update_item(
        Key={"userId": user_id, "sk": sk},
        UpdateExpression="SET " + ", ".join(update_expr_parts),
        ExpressionAttributeNames={k: v for k, v in expr_names.items() if k in " ".join(update_expr_parts)},
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )

    log_audit_event(
        user_id=user_id,
        event_type=AuditEventType.DATA_WRITE,
        resource_id=sk,
        ip_address=_get_ip(event),
        user_agent=_get_user_agent(event),
    )

    logger.info("Biomarker updated", extra={"sk": sk})
    return _success(result.get("Attributes", {}), request_id=request_id)


def _handle_delete_biomarker(
    user_id: str, sk: str, request_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    existing = _get_table().get_item(Key={"userId": user_id, "sk": sk})
    item = existing.get("Item")
    if not item:
        raise NotFoundError(message=f"Biomarker with key '{sk}' not found.")
    enforce_user_isolation(user_id, item["userId"])

    _get_table().delete_item(Key={"userId": user_id, "sk": sk})

    log_audit_event(
        user_id=user_id,
        event_type=AuditEventType.DATA_DELETE,
        resource_id=sk,
        ip_address=_get_ip(event),
        user_agent=_get_user_agent(event),
    )

    logger.info("Biomarker deleted", extra={"sk": sk})
    return _success({"deleted": True, "sk": sk}, request_id=request_id)


def _handle_batch_create(
    user_id: str, request_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    body = json.loads(event.get("body") or "{}")
    req = BatchCreateRequest.model_validate(body)
    now = datetime.now(tz=timezone.utc)
    batch_id = str(uuid.uuid4())

    from shared.validators import get_biomarker_ranges

    ranges = get_biomarker_ranges()

    items: list[dict[str, Any]] = []
    for i, record in enumerate(req.records):
        timestamp = (now.isoformat() + f".{i:04d}")
        status = validate_biomarker_value(record.biomarker_type.value, record.value)
        ref = ranges.get(record.biomarker_type.value, {})

        sk = f"BIOMARKER#{timestamp}#{record.biomarker_type.value}"
        items.append(
            {
                "userId": user_id,
                "sk": sk,
                "entityType": "BIOMARKER",
                "biomarkerType": record.biomarker_type.value,
                "value": Decimal(str(record.value)),
                "unit": record.unit,
                "referenceRangeLow": Decimal(str(ref.get("optimalLow", 0))),
                "referenceRangeHigh": Decimal(str(ref.get("optimalHigh", 0))),
                "status": status.value,
                "source": record.source.value,
                "batchId": batch_id,
                "createdAt": timestamp,
            }
        )

    table = _get_table()
    with table.batch_writer() as batch:
        for item in items:
            batch.put_item(Item=item)

    log_audit_event(
        user_id=user_id,
        event_type=AuditEventType.DATA_WRITE,
        resource_id=f"batch:{batch_id}",
        ip_address=_get_ip(event),
        user_agent=_get_user_agent(event),
    )

    logger.info("Batch created", extra={"batchId": batch_id, "count": len(items)})
    return _success(
        {"batchId": batch_id, "count": len(items), "records": items},
        status_code=201,
        request_id=request_id,
    )


# ─── Profile handlers ──────────────────────────────────────────


def _handle_get_profile(
    user_id: str, request_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    result = _get_table().get_item(Key={"userId": user_id, "sk": "PROFILE"})
    item = result.get("Item")

    if not item:
        # Return a default profile if none exists yet
        item = {
            "userId": user_id,
            "sk": "PROFILE",
            "entityType": "PROFILE",
            "tier": "free",
            "unitsPreference": "metric",
            "notificationsEnabled": True,
            "createdAt": datetime.now(tz=timezone.utc).isoformat(),
        }
        _get_table().put_item(Item=item)

    return _success(item, request_id=request_id)


def _handle_update_profile(
    user_id: str, request_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    body = json.loads(event.get("body") or "{}")
    allowed_fields = {"displayName", "unitsPreference", "notificationsEnabled"}

    updates = {k: v for k, v in body.items() if k in allowed_fields}
    if not updates:
        raise ValidationError(message="No valid fields to update.")

    update_parts: list[str] = []
    expr_values: dict[str, Any] = {}
    expr_names: dict[str, str] = {}

    for key, value in updates.items():
        placeholder = f"#{key}"
        value_placeholder = f":{key}"
        expr_names[placeholder] = key
        expr_values[value_placeholder] = value
        update_parts.append(f"{placeholder} = {value_placeholder}")

    result = _get_table().update_item(
        Key={"userId": user_id, "sk": "PROFILE"},
        UpdateExpression="SET " + ", ".join(update_parts),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )

    log_audit_event(
        user_id=user_id,
        event_type=AuditEventType.DATA_WRITE,
        resource_id="PROFILE",
        ip_address=_get_ip(event),
        user_agent=_get_user_agent(event),
    )

    return _success(result.get("Attributes", {}), request_id=request_id)
