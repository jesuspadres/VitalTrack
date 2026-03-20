"""Lambda handler for presigned URL generation and upload batch status tracking.

Generates S3 presigned PUT URLs scoped to the authenticated user's prefix,
and tracks CSV upload batch processing status.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import boto3

from src.config.settings import get_settings
from src.middleware.auth import extract_user_id
from src.middleware.audit import AuditEventType, log_audit_event
from src.middleware.error_handler import error_handler
from src.middleware.logging_config import get_logger, inject_correlation_id
from src.shared.exceptions import NotFoundError, ValidationError

logger = get_logger("upload-presign")
settings = get_settings()

_s3_client = boto3.client("s3")
_dynamodb = boto3.resource("dynamodb")

PRESIGNED_URL_EXPIRY = 900  # 15 minutes
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


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
            }
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

    # POST /v1/upload/presign — generate presigned URL
    if path.endswith("/presign") and method == "POST":
        return _handle_presign(user_id, request_id, event)

    # GET /v1/upload/{batchId}/status — check batch status
    batch_id = path_params.get("batchId")
    if batch_id and path.endswith("/status") and method == "GET":
        return _handle_batch_status(user_id, batch_id, request_id, event)

    raise ValidationError(message=f"Unsupported route: {method} {path}")


def _handle_presign(
    user_id: str, request_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    body = json.loads(event.get("body") or "{}")
    filename = body.get("filename", "upload.csv")

    # Validate filename
    if not filename.lower().endswith(".csv"):
        raise ValidationError(
            message="Only CSV files are supported.",
            details=[{"field": "filename", "issue": "must end with .csv"}],
        )

    batch_id = str(uuid.uuid4())
    now = datetime.now(tz=timezone.utc).isoformat()

    # S3 key scoped to user's prefix
    s3_key = f"uploads/{user_id}/{batch_id}/{filename}"

    # Generate presigned PUT URL
    presigned_url = _s3_client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.data_bucket,
            "Key": s3_key,
            "ContentType": "text/csv",
        },
        ExpiresIn=PRESIGNED_URL_EXPIRY,
    )

    # Track batch status in DynamoDB
    table = _dynamodb.Table(settings.biomarkers_table)
    table.put_item(
        Item={
            "userId": user_id,
            "sk": f"UPLOAD#{batch_id}",
            "entityType": "UPLOAD",
            "batchId": batch_id,
            "status": "PENDING",
            "filename": filename,
            "s3Key": s3_key,
            "createdAt": now,
        }
    )

    log_audit_event(
        user_id=user_id,
        event_type=AuditEventType.DATA_WRITE,
        resource_id=f"upload:{batch_id}",
        ip_address=_get_ip(event),
        user_agent=_get_user_agent(event),
    )

    logger.info("Presigned URL generated", extra={"batchId": batch_id, "s3Key": s3_key})

    return _success(
        {
            "uploadUrl": presigned_url,
            "key": s3_key,
            "batchId": batch_id,
            "expiresIn": PRESIGNED_URL_EXPIRY,
        },
        status_code=201,
        request_id=request_id,
    )


def _handle_batch_status(
    user_id: str, batch_id: str, request_id: str, event: dict[str, Any]
) -> dict[str, Any]:
    table = _dynamodb.Table(settings.biomarkers_table)
    result = table.get_item(Key={"userId": user_id, "sk": f"UPLOAD#{batch_id}"})
    item = result.get("Item")

    if not item:
        raise NotFoundError(message=f"Upload batch '{batch_id}' not found.")

    log_audit_event(
        user_id=user_id,
        event_type=AuditEventType.DATA_ACCESS,
        resource_id=f"upload:{batch_id}",
        ip_address=_get_ip(event),
        user_agent=_get_user_agent(event),
    )

    return _success(
        {
            "batchId": item.get("batchId"),
            "status": item.get("status"),
            "filename": item.get("filename"),
            "recordCount": item.get("recordCount", 0),
            "errorCount": item.get("errorCount", 0),
            "createdAt": item.get("createdAt"),
        },
        request_id=request_id,
    )
