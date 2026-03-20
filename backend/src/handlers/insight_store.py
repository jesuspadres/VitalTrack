"""Lambda handler for storing AI-generated insights in DynamoDB.

This is the storage step in the Step Functions insight generation workflow.
Receives the validated insight from the generate step, persists it to the
insights table, and publishes an InsightGenerated event to EventBridge for
downstream consumers.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, Any

import boto3

if TYPE_CHECKING:
    from mypy_boto3_dynamodb.service_resource import Table

from config.settings import get_settings
from middleware.logging_config import get_logger

logger = get_logger("insight-store")
settings = get_settings()

_dynamodb = boto3.resource("dynamodb")
_events_client = boto3.client("events")


def _get_insights_table() -> Table:
    return _dynamodb.Table(settings.insights_table)


def _convert_decimals(obj: Any) -> Any:
    """Recursively convert float/int values to Decimal for DynamoDB."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, int) and not isinstance(obj, bool):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _convert_decimals(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_convert_decimals(item) for item in obj]
    return obj


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Entry point — invoked by Step Functions after insight generation."""
    logger.info("Insight store invoked", extra={"event": json.dumps(event, default=str)})

    user_id: str = event["userId"]
    batch_id: str = event["batchId"]
    insight: dict[str, Any] = event["insight"]
    model_id: str = event["modelId"]
    prompt_version: str = event["promptVersion"]

    now = datetime.now(tz=timezone.utc).isoformat()
    insight_id = f"INSIGHT#{now}#{uuid.uuid4()}"

    logger.info(
        "Storing insight",
        extra={"userId": user_id, "insightId": insight_id, "batchId": batch_id},
    )

    # Build the DynamoDB item — store structured data natively
    item: dict[str, Any] = {
        "userId": user_id,
        "insightId": insight_id,
        "createdAt": now,
        "sourceBatchId": batch_id,
        "category": "GENERAL",
        "summary": insight.get("summary", ""),
        "fullAnalysis": insight.get("summary", ""),
        "actionPlan": _convert_decimals(insight.get("actionPlan", [])),
        "riskFlags": _convert_decimals(insight.get("riskFlags", [])),
        "categoryScores": _convert_decimals(insight.get("categoryScores", {})),
        "modelId": model_id,
        "promptVersion": prompt_version,
        "overallScore": Decimal(str(insight.get("overallScore", 0))),
    }

    # Write to DynamoDB
    table = _get_insights_table()
    table.put_item(Item=item)

    logger.info(
        "Insight stored successfully",
        extra={"userId": user_id, "insightId": insight_id},
    )

    # Publish InsightGenerated event to EventBridge
    try:
        _events_client.put_events(
            Entries=[
                {
                    "Source": "vitaltrack.insights",
                    "DetailType": "InsightGenerated",
                    "Detail": json.dumps({
                        "userId": user_id,
                        "insightId": insight_id,
                        "timestamp": now,
                    }),
                    "EventBusName": settings.event_bus_name,
                }
            ]
        )
        logger.info(
            "InsightGenerated event published",
            extra={"userId": user_id, "insightId": insight_id},
        )
    except Exception:
        logger.exception("Failed to publish InsightGenerated event")

    return {
        "userId": user_id,
        "insightId": insight_id,
        "status": "STORED",
    }
