"""Environment-aware configuration for VitalTrack Lambda functions.

Reads all tunables from environment variables with sensible defaults for
local development. A module-level singleton is exposed via ``get_settings()``.
"""

from __future__ import annotations

import os
from functools import lru_cache

from src.shared.constants import (
    ENV_AUDIT_TABLE,
    ENV_BIOMARKERS_TABLE,
    ENV_DATA_BUCKET,
    ENV_EVENT_BUS_NAME,
    ENV_INSIGHTS_TABLE,
    ENV_STAGE,
)


class Settings:
    """Immutable application settings sourced from environment variables."""

    def __init__(self) -> None:
        self.stage: str = os.environ.get(ENV_STAGE, "dev")
        self.biomarkers_table: str = os.environ.get(
            ENV_BIOMARKERS_TABLE, f"vitaltrack-biomarkers-{self.stage}"
        )
        self.insights_table: str = os.environ.get(
            ENV_INSIGHTS_TABLE, f"vitaltrack-insights-{self.stage}"
        )
        self.audit_table: str = os.environ.get(
            ENV_AUDIT_TABLE, f"vitaltrack-audit-{self.stage}"
        )
        self.data_bucket: str = os.environ.get(
            ENV_DATA_BUCKET, f"vitaltrack-data-{self.stage}"
        )
        self.event_bus_name: str = os.environ.get(
            ENV_EVENT_BUS_NAME, f"vitaltrack-events-{self.stage}"
        )
        self.bedrock_model_id: str = os.environ.get(
            "BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20241022-v2:0"
        )
        self.notification_topic_arn: str = os.environ.get(
            "NOTIFICATION_TOPIC_ARN", ""
        )

    def __repr__(self) -> str:
        return (
            f"Settings(stage={self.stage!r}, biomarkers_table={self.biomarkers_table!r}, "
            f"insights_table={self.insights_table!r}, audit_table={self.audit_table!r}, "
            f"data_bucket={self.data_bucket!r}, event_bus_name={self.event_bus_name!r})"
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the singleton ``Settings`` instance, creating it on first call."""
    return Settings()
