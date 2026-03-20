"""Lambda handler to notify users that their health insight is ready.

Final step in the Step Functions insight workflow. Publishes to an SNS
topic so the user receives an email (or other subscribed endpoint) with
a pointer to their newly generated insight.  Notification is best-effort
— failures here must never break the workflow.
"""

from __future__ import annotations

import os
from typing import Any

import boto3

from config.settings import get_settings
from middleware.logging_config import get_logger

logger = get_logger("insight-notify")
settings = get_settings()

_sns_client = boto3.client("sns")


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Entry point — invoked by the Step Functions insight workflow."""
    user_id: str = event.get("userId", "")
    insight_id: str = event.get("insightId", "")

    try:
        topic_arn: str = os.environ.get("NOTIFICATION_TOPIC_ARN", "")

        if not topic_arn:
            logger.warning(
                "NOTIFICATION_TOPIC_ARN not configured — skipping notification",
                extra={"userId": user_id, "insightId": insight_id},
            )
            return {
                "userId": user_id,
                "insightId": insight_id,
                "notified": False,
            }

        logger.info(
            "Publishing insight notification",
            extra={"userId": user_id, "insightId": insight_id},
        )

        _sns_client.publish(
            TopicArn=topic_arn,
            Subject="VitalTrack: Your Health Insight is Ready",
            Message=f"Your latest health analysis is ready to view. Insight ID: {insight_id}",
            MessageAttributes={
                "userId": {"DataType": "String", "StringValue": user_id},
            },
        )

        logger.info(
            "Notification sent successfully",
            extra={"userId": user_id, "insightId": insight_id},
        )

        return {
            "userId": user_id,
            "insightId": insight_id,
            "notified": True,
        }

    except Exception:
        logger.exception(
            "Failed to send notification — continuing workflow",
            extra={"userId": user_id, "insightId": insight_id},
        )
        return {
            "userId": user_id,
            "insightId": insight_id,
            "notified": False,
        }
