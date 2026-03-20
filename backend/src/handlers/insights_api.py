"""Lambda handler for insights API endpoints.

Handles listing, retrieving, and manually triggering insight generation.
"""

from __future__ import annotations

import json
from typing import Any

import boto3
from datetime import datetime, timezone

from src.config.settings import get_settings
from src.middleware.auth import extract_user_id
from src.middleware.audit import AuditEventType, log_audit_event
from src.middleware.error_handler import error_handler
from src.middleware.logging_config import get_logger, inject_correlation_id
from src.shared.exceptions import NotFoundError, ValidationError

logger = get_logger("insights-api")
settings = get_settings()

_dynamodb = boto3.resource("dynamodb")


def _get_request_id(event: dict[str, Any]) -> str:
    return (event.get("requestContext") or {}).get("requestId", "unknown")


def _get_ip(event: dict[str, Any]) -> str:
    identity = (event.get("requestContext") or {}).get("identity") or {}
    return identity.get("sourceIp", "unknown")


def _get_user_agent(event: dict[str, Any]) -> str:
    headers = event.get("headers") or {}
    return headers.get("User-Agent", headers.get("user-agent", "unknown"))


def _success(data: Any, status_code: int = 200, request_id: str = "unknown") -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json", "X-Request-Id": request_id},
        "body": json.dumps(
            {
                "success": True,
                "data": data,
                "meta": {
                    "requestId": request_id,
                    "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                },
            },
            default=str,
        ),
    }


@error_handler(logger)
def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    inject_correlation_id(logger, event)
    logger.info("Incoming request", extra={"path": event.get("path"), "method": event.get("httpMethod")})

    method = event.get("httpMethod", "")
    path = event.get("path", "")
    request_id = _get_request_id(event)
    user_id = extract_user_id(event)
    path_params = event.get("pathParameters") or {}

    # POST /v1/insights/generate — trigger manual insight generation
    if path.endswith("/generate") and method == "POST":
        return _handle_generate_trigger(user_id, request_id, event)

    # GET /v1/insights/{insightId} — get specific insight
    insight_id = path_params.get("insightId")
    if insight_id and method == "GET":
        return _handle_get_insight(user_id, insight_id, request_id, event)

    # GET /v1/insights — list insights
    if method == "GET":
        return _handle_list_insights(user_id, request_id, event)

    raise ValidationError(message=f"Unsupported route: {method} {path}")


def _handle_list_insights(
    user_id: str, request_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    """List AI-generated insights for the user, newest first."""
    table = _dynamodb.Table(settings.insights_table)
    params = event.get("queryStringParameters") or {}
    limit = min(int(params.get("limit", "20")), 50)

    query_kwargs: dict[str, Any] = {
        "KeyConditionExpression": "userId = :uid",
        "ExpressionAttributeValues": {":uid": user_id},
        "ScanIndexForward": False,
        "Limit": limit,
    }

    # Pagination via exclusive start key
    next_token = params.get("nextToken")
    if next_token:
        import base64
        decoded = json.loads(base64.b64decode(next_token).decode("utf-8"))
        query_kwargs["ExclusiveStartKey"] = decoded

    result = table.query(**query_kwargs)
    items = result.get("Items", [])

    response_data: dict[str, Any] = {
        "insights": items,
        "count": len(items),
    }

    last_key = result.get("LastEvaluatedKey")
    if last_key:
        import base64
        response_data["nextToken"] = base64.b64encode(
            json.dumps(last_key, default=str).encode("utf-8")
        ).decode("utf-8")

    log_audit_event(
        user_id=user_id,
        event_type=AuditEventType.DATA_ACCESS,
        resource_id="insights:list",
        ip_address=_get_ip(event),
        user_agent=_get_user_agent(event),
    )

    return _success(response_data, request_id=request_id)


def _handle_get_insight(
    user_id: str, insight_id: str, request_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    """Get a specific insight by ID."""
    table = _dynamodb.Table(settings.insights_table)
    result = table.get_item(Key={"userId": user_id, "insightId": insight_id})
    item = result.get("Item")

    if not item:
        raise NotFoundError(message=f"Insight '{insight_id}' not found.")

    log_audit_event(
        user_id=user_id,
        event_type=AuditEventType.DATA_ACCESS,
        resource_id=f"insight:{insight_id}",
        ip_address=_get_ip(event),
        user_agent=_get_user_agent(event),
    )

    return _success(item, request_id=request_id)


def _handle_generate_trigger(
    user_id: str, request_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    """Manually trigger insight generation for the user's latest data.

    This publishes a BiomarkersIngested event to EventBridge, which triggers
    the Step Functions insight workflow.
    """
    events_client = boto3.client("events")

    # Count user's biomarkers to validate they have data
    biomarkers_table = _dynamodb.Table(settings.biomarkers_table)
    resp = biomarkers_table.query(
        KeyConditionExpression="userId = :uid AND begins_with(sk, :prefix)",
        ExpressionAttributeValues={":uid": user_id, ":prefix": "BIOMARKER#"},
        Select="COUNT",
    )
    count = resp.get("Count", 0)

    if count == 0:
        raise ValidationError(
            message="No biomarker data found. Upload biomarker data before generating insights."
        )

    now = datetime.now(tz=timezone.utc).isoformat()

    events_client.put_events(
        Entries=[
            {
                "Source": "vitaltrack.insights-api",
                "DetailType": "BiomarkersIngested",
                "Detail": json.dumps({
                    "userId": user_id,
                    "batchId": f"manual-{request_id}",
                    "biomarkerCount": count,
                    "source": "MANUAL",
                    "timestamp": now,
                }),
                "EventBusName": settings.event_bus_name,
            }
        ]
    )

    log_audit_event(
        user_id=user_id,
        event_type=AuditEventType.DATA_WRITE,
        resource_id="insights:generate",
        ip_address=_get_ip(event),
        user_agent=_get_user_agent(event),
    )

    return _success(
        {"status": "TRIGGERED", "message": "Insight generation has been initiated."},
        status_code=202,
        request_id=request_id,
    )
