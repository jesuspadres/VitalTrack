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
from typing import Any

import boto3
from mypy_boto3_dynamodb.service_resource import Table

from src.config.settings import get_settings
from src.middleware.logging_config import get_logger

logger = get_logger("insight-store")
settings = get_settings()

_dynamodb = boto3.resource("dynamodb")
_events_client = boto3.client("events")


def _get_insights_table() -> Table:
    return _dynamodb.Table(settings.insights_table)


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

    # Build the DynamoDB item
    item: dict[str, Any] = {
        "userId": user_id,
        "insightId": insight_id,
        "createdAt": now,
        "sourceBatchId": batch_id,
        "category": "GENERAL",
        "summary": insight.get("summary", ""),
        "fullAnalysis": json.dumps(insight, default=str),
        "actionPlan": json.dumps(insight.get("actionPlan", []), default=str),
        "riskFlags": json.dumps(insight.get("riskFlags", []), default=str),
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
