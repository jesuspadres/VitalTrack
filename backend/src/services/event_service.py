"""EventBridge service wrapper for VitalTrack.

Publishes domain events to the VitalTrack custom event bus so that
downstream consumers (e.g. Step Functions for insight generation) can
react asynchronously.
"""

from __future__ import annotations

import json
from typing import Any

from typing import TYPE_CHECKING

import boto3
from botocore.exceptions import ClientError

if TYPE_CHECKING:
    from mypy_boto3_events.client import EventBridgeClient

from middleware.logging_config import get_logger
from shared.exceptions import InternalError

logger = get_logger("event-service")


class EventService:
    """Publishes events to an EventBridge custom event bus."""

    def __init__(self, event_bus_name: str) -> None:
        self._event_bus_name = event_bus_name
        self._client: EventBridgeClient | None = None

    def _get_client(self) -> EventBridgeClient:
        """Return the cached boto3 EventBridge client."""
        if self._client is None:
            self._client = boto3.client("events")
        return self._client

    def publish_event(
        self,
        source: str,
        detail_type: str,
        detail: dict[str, Any],
    ) -> None:
        """Put a single event onto the event bus.

        Args:
            source: Event source identifier (e.g. ``"vitaltrack.biomarkers"``).
            detail_type: Descriptive event type (e.g. ``"BiomarkersIngested"``).
            detail: Arbitrary JSON-serialisable dict for the event detail.
        """
        try:
            response = self._get_client().put_events(
                Entries=[
                    {
                        "Source": source,
                        "DetailType": detail_type,
                        "Detail": json.dumps(detail),
                        "EventBusName": self._event_bus_name,
                    }
                ],
            )

            # EventBridge may accept the API call but still fail individual entries
            failed_count: int = response.get("FailedEntryCount", 0)
            if failed_count > 0:
                entries = response.get("Entries", [])
                logger.error(
                    "EventBridge partial failure",
                    extra={
                        "failed_count": failed_count,
                        "entries": entries,
                        "detail_type": detail_type,
                    },
                )
                raise InternalError(
                    message="Failed to publish event.",
                    details=[{"failedEntries": entries}],
                )

        except ClientError as exc:
            logger.exception(
                "publish_event failed",
                extra={
                    "event_bus": self._event_bus_name,
                    "detail_type": detail_type,
                },
            )
            raise InternalError(
                message="Failed to publish event.",
                details=[{"error": str(exc)}],
            ) from exc
