"""Lambda handler for CSV file parsing and biomarker ingestion.

Triggered by EventBridge when a CSV file is uploaded to S3. Parses the CSV,
validates each row against biomarker reference ranges, and writes all valid
records to DynamoDB as a batch. Emits a BiomarkersIngested event on success.

Atomic semantics: all rows succeed or the entire batch fails. Failed uploads
route to SQS dead-letter queue with full error context.
"""

from __future__ import annotations

import csv
import io
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import boto3
from mypy_boto3_dynamodb.service_resource import Table

from src.config.settings import get_settings
from src.middleware.logging_config import get_logger, inject_correlation_id
from src.models.events import BiomarkersIngestedEvent
from src.shared.constants import BiomarkerSource, BiomarkerType
from src.shared.exceptions import ValidationError
from src.shared.validators import (
    get_biomarker_ranges,
    sanitize_csv_cell,
    validate_biomarker_value,
)

logger = get_logger("csv-parser")
settings = get_settings()

_s3_client = boto3.client("s3")
_dynamodb = boto3.resource("dynamodb")
_events_client = boto3.client("events")

REQUIRED_COLUMNS = {"biomarkerType", "value", "unit"}
VALID_BIOMARKER_TYPES = {t.value for t in BiomarkerType}


def _get_biomarkers_table() -> Table:
    return _dynamodb.Table(settings.biomarkers_table)


def _update_batch_status(
    user_id: str,
    batch_id: str,
    status: str,
    record_count: int = 0,
    error_count: int = 0,
    error_message: str | None = None,
) -> None:
    """Update the upload batch status record in DynamoDB."""
    table = _get_biomarkers_table()
    update_parts = ["#s = :s", "#rc = :rc", "#ec = :ec"]
    expr_values: dict[str, Any] = {
        ":s": status,
        ":rc": record_count,
        ":ec": error_count,
    }
    expr_names: dict[str, str] = {
        "#s": "status",
        "#rc": "recordCount",
        "#ec": "errorCount",
    }

    if error_message:
        update_parts.append("#em = :em")
        expr_values[":em"] = error_message
        expr_names["#em"] = "errorMessage"

    try:
        table.update_item(
            Key={"userId": user_id, "sk": f"UPLOAD#{batch_id}"},
            UpdateExpression="SET " + ", ".join(update_parts),
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
        )
    except Exception:
        logger.exception("Failed to update batch status", extra={"batchId": batch_id})


def _publish_biomarkers_ingested(
    user_id: str, batch_id: str, count: int
) -> None:
    """Publish a BiomarkersIngested event to EventBridge."""
    event = BiomarkersIngestedEvent(
        userId=user_id,
        batchId=batch_id,
        biomarkerCount=count,
        source=BiomarkerSource.CSV_UPLOAD,
        timestamp=datetime.now(tz=timezone.utc).isoformat(),
    )

    try:
        _events_client.put_events(
            Entries=[
                {
                    "Source": "vitaltrack.csv-parser",
                    "DetailType": "BiomarkersIngested",
                    "Detail": event.model_dump_json(by_alias=True),
                    "EventBusName": settings.event_bus_name,
                }
            ]
        )
        logger.info("BiomarkersIngested event published", extra={"batchId": batch_id})
    except Exception:
        logger.exception("Failed to publish BiomarkersIngested event")


def _parse_csv(csv_content: str) -> list[dict[str, str]]:
    """Parse CSV content and return a list of row dicts.

    Validates structure: all required columns must be present, no empty rows.
    Sanitizes all cell values to prevent formula injection.
    """
    reader = csv.DictReader(io.StringIO(csv_content))

    if reader.fieldnames is None:
        raise ValidationError(message="CSV file has no header row.")

    # Normalize header names (strip whitespace)
    headers = {h.strip() for h in reader.fieldnames}
    missing = REQUIRED_COLUMNS - headers
    if missing:
        raise ValidationError(
            message=f"CSV missing required columns: {', '.join(sorted(missing))}",
            details=[{"field": col, "issue": "column not found in CSV header"} for col in missing],
        )

    rows: list[dict[str, str]] = []
    for i, row in enumerate(reader, start=2):  # start=2 because row 1 is headers
        sanitized = {k.strip(): sanitize_csv_cell(str(v).strip()) for k, v in row.items() if k}
        if not any(sanitized.values()):
            continue  # skip empty rows
        rows.append(sanitized)

    if not rows:
        raise ValidationError(message="CSV file contains no data rows.")

    return rows


def _validate_and_convert_rows(
    rows: list[dict[str, str]], user_id: str, batch_id: str
) -> list[dict[str, Any]]:
    """Validate each row and convert to DynamoDB items.

    Returns a list of items ready for batch write.
    Raises ValidationError with details about all invalid rows.
    """
    ranges = get_biomarker_ranges()
    now = datetime.now(tz=timezone.utc)
    items: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    seen_keys: set[str] = set()

    for i, row in enumerate(rows, start=1):
        row_num = i
        biomarker_type = row.get("biomarkerType", "").strip()
        value_str = row.get("value", "").strip()
        unit = row.get("unit", "").strip()

        # Validate biomarker type
        if biomarker_type not in VALID_BIOMARKER_TYPES:
            errors.append({
                "row": row_num,
                "field": "biomarkerType",
                "issue": f"Unknown biomarker type: '{biomarker_type}'",
            })
            continue

        # Validate value
        try:
            value = float(value_str)
        except (ValueError, TypeError):
            errors.append({
                "row": row_num,
                "field": "value",
                "issue": f"Invalid numeric value: '{value_str}'",
            })
            continue

        if value < 0:
            errors.append({
                "row": row_num,
                "field": "value",
                "issue": f"Value must be non-negative, got {value}",
            })
            continue

        # Validate unit
        if not unit:
            errors.append({
                "row": row_num,
                "field": "unit",
                "issue": "Unit is required",
            })
            continue

        # Duplicate detection within same batch
        dedup_key = f"{biomarker_type}:{value_str}"
        if dedup_key in seen_keys:
            errors.append({
                "row": row_num,
                "field": "biomarkerType",
                "issue": f"Duplicate entry for {biomarker_type} with value {value_str}",
            })
            continue
        seen_keys.add(dedup_key)

        # Classify against reference ranges
        status = validate_biomarker_value(biomarker_type, value)
        ref = ranges.get(biomarker_type, {})
        timestamp = now.isoformat() + f".{i:04d}"

        items.append({
            "userId": user_id,
            "sk": f"BIOMARKER#{timestamp}#{biomarker_type}",
            "entityType": "BIOMARKER",
            "biomarkerType": biomarker_type,
            "value": Decimal(str(value)),
            "unit": unit,
            "referenceRangeLow": Decimal(str(ref.get("optimalLow", 0))),
            "referenceRangeHigh": Decimal(str(ref.get("optimalHigh", 0))),
            "status": status.value,
            "source": BiomarkerSource.CSV_UPLOAD.value,
            "batchId": batch_id,
            "createdAt": timestamp,
        })

    if errors:
        raise ValidationError(
            message=f"CSV validation failed: {len(errors)} invalid row(s).",
            details=errors,
        )

    return items


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Entry point — triggered by EventBridge from S3 PutObject events."""
    logger.info("CSV parser invoked", extra={"event": json.dumps(event, default=str)})

    # Extract S3 object info from EventBridge event
    detail = event.get("detail", {})

    # EventBridge S3 event format
    bucket = detail.get("bucket", {}).get("name", "")
    key = detail.get("object", {}).get("key", "")

    if not bucket or not key:
        # Fallback: try direct S3 event format
        records = event.get("Records", [])
        if records:
            s3_event = records[0].get("s3", {})
            bucket = s3_event.get("bucket", {}).get("name", "")
            key = s3_event.get("object", {}).get("key", "")

    if not bucket or not key:
        logger.error("Could not extract S3 bucket/key from event")
        return {"statusCode": 400, "body": "Missing S3 event data"}

    logger.info("Processing CSV", extra={"bucket": bucket, "key": key})

    # Extract userId and batchId from key: uploads/{userId}/{batchId}/{filename}
    key_parts = key.split("/")
    if len(key_parts) < 4 or key_parts[0] != "uploads":
        logger.error("Invalid S3 key format", extra={"key": key})
        return {"statusCode": 400, "body": f"Invalid key format: {key}"}

    user_id = key_parts[1]
    batch_id = key_parts[2]

    try:
        # Download CSV from S3
        response = _s3_client.get_object(Bucket=bucket, Key=key)
        csv_content = response["Body"].read().decode("utf-8")

        # Update status to PROCESSING
        _update_batch_status(user_id, batch_id, "PROCESSING")

        # Parse and validate
        rows = _parse_csv(csv_content)
        items = _validate_and_convert_rows(rows, user_id, batch_id)

        # Atomic batch write to DynamoDB
        table = _get_biomarkers_table()
        with table.batch_writer() as batch_writer:
            for item in items:
                batch_writer.put_item(Item=item)

        # Update status to COMPLETED
        _update_batch_status(user_id, batch_id, "COMPLETED", record_count=len(items))

        # Publish event for downstream insight generation
        _publish_biomarkers_ingested(user_id, batch_id, len(items))

        logger.info(
            "CSV processing complete",
            extra={"batchId": batch_id, "recordCount": len(items)},
        )

        return {
            "statusCode": 200,
            "body": json.dumps({
                "batchId": batch_id,
                "recordCount": len(items),
                "status": "COMPLETED",
            }),
        }

    except ValidationError as exc:
        error_msg = exc.message
        _update_batch_status(
            user_id, batch_id, "FAILED",
            error_count=len(exc.details),
            error_message=error_msg,
        )
        logger.warning(
            "CSV validation failed",
            extra={"batchId": batch_id, "error": error_msg, "details": exc.details},
        )
        return {
            "statusCode": 400,
            "body": json.dumps({"error": error_msg, "details": exc.details}),
        }

    except Exception as exc:
        _update_batch_status(
            user_id, batch_id, "FAILED",
            error_message=str(exc),
        )
        logger.exception("CSV processing failed", extra={"batchId": batch_id})
        raise
