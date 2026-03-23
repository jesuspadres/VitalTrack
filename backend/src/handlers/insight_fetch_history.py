"""Lambda handler to fetch biomarker history for AI insight generation.

First step in the Step Functions insight workflow. Queries DynamoDB for the
user's recent biomarker records (last 3 per type) and the current batch,
then passes the assembled data to the Bedrock inference step.
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import TYPE_CHECKING, Any

import boto3
from boto3.dynamodb.conditions import Key

if TYPE_CHECKING:
    from mypy_boto3_dynamodb.service_resource import Table

from config.settings import get_settings
from middleware.logging_config import get_logger
from shared.constants import BiomarkerType

logger = get_logger("insight-fetch-history")
settings = get_settings()

_dynamodb = boto3.resource("dynamodb")

HISTORY_DEPTH = 3  # number of most-recent records to keep per biomarker type


def _get_biomarkers_table() -> Table:
    return _dynamodb.Table(settings.biomarkers_table)


def _decimal_to_float(obj: Any) -> Any:
    """Recursively convert Decimal values to float for JSON serialization."""
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: _decimal_to_float(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_decimal_to_float(item) for item in obj]
    return obj


def _fetch_all_biomarkers(user_id: str) -> list[dict[str, Any]]:
    """Query all biomarker records for a user, newest first."""
    table = _get_biomarkers_table()
    response = table.query(
        KeyConditionExpression=Key("userId").eq(user_id) & Key("sk").begins_with("BIOMARKER#"),
        ScanIndexForward=False,
    )
    items: list[dict[str, Any]] = response.get("Items", [])

    # Handle pagination in case of large result sets
    while "LastEvaluatedKey" in response:
        response = table.query(
            KeyConditionExpression=Key("userId").eq(user_id) & Key("sk").begins_with("BIOMARKER#"),
            ScanIndexForward=False,
            ExclusiveStartKey=response["LastEvaluatedKey"],
        )
        items.extend(response.get("Items", []))

    return items


def _build_history(
    items: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Group records by biomarker type and keep the last N per type.

    Items are expected to arrive in descending sort-key order (newest first),
    so we simply take the first ``HISTORY_DEPTH`` entries per type.
    """
    history: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for item in items:
        btype = item.get("biomarkerType", "")
        if btype and len(history[btype]) < HISTORY_DEPTH:
            history[btype].append(item)

    return dict(history)


def _extract_current_batch(
    items: list[dict[str, Any]], batch_id: str
) -> list[dict[str, Any]]:
    """Return only the records belonging to the current upload batch."""
    return [item for item in items if item.get("batchId") == batch_id]


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Entry point — invoked by the Step Functions insight workflow."""
    # EventBridge wraps the payload in "detail"; direct invocations pass at top level
    detail = event.get("detail", event)
    user_id: str = detail["userId"]
    batch_id: str = detail["batchId"]

    logger.info(
        "Fetching biomarker history for insight generation",
        extra={"userId": user_id, "batchId": batch_id},
    )

    # Fetch all biomarker records for the user
    all_items = _fetch_all_biomarkers(user_id)
    logger.info(
        "Biomarker records retrieved",
        extra={"userId": user_id, "totalRecords": len(all_items)},
    )

    # Build per-type history (last 3 records each)
    biomarker_history = _build_history(all_items)

    # Extract the current batch's records (if any)
    current_results = _extract_current_batch(all_items, batch_id)

    # For manual triggers the batchId won't match any records, so fall back
    # to evaluating sufficiency based on the full history instead.
    if current_results:
        unique_types = {r.get("biomarkerType") for r in current_results if r.get("biomarkerType")}
    else:
        unique_types = set(biomarker_history.keys())
        current_results = _decimal_to_float(all_items)  # give the model everything

    biomarker_count = len(unique_types)

    logger.info(
        "History assembled",
        extra={
            "batchId": batch_id,
            "historyTypes": len(biomarker_history),
            "currentBatchRecords": len(current_results),
            "uniqueBiomarkerTypes": biomarker_count,
        },
    )

    insufficient = biomarker_count < 3
    result: dict[str, Any] = {
        "userId": user_id,
        "batchId": batch_id,
        "biomarkerHistory": _decimal_to_float(biomarker_history),
        "currentResults": _decimal_to_float(current_results),
        "biomarkerCount": biomarker_count,
        "insufficientData": insufficient,
    }

    if insufficient:
        logger.info(
            "Insufficient biomarker data for full insight",
            extra={"batchId": batch_id, "biomarkerCount": biomarker_count},
        )

    return result
