"""Pydantic v2 models for EventBridge event payloads.

These models define the ``detail`` schema for domain events published to the
VitalTrack custom event bus.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from shared.constants import BiomarkerSource


class BiomarkersIngestedEvent(BaseModel):
    """Published after a batch of biomarker records has been successfully
    written to DynamoDB — triggers downstream insight generation."""

    model_config = ConfigDict(strict=True, extra="forbid", populate_by_name=True)

    user_id: str = Field(..., alias="userId")
    batch_id: str = Field(..., alias="batchId")
    biomarker_count: int = Field(
        ...,
        ge=1,
        alias="biomarkerCount",
        description="Number of biomarker records in the batch.",
    )
    source: BiomarkerSource
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp of ingestion.")


class InsightGeneratedEvent(BaseModel):
    """Published after an AI insight has been generated and stored."""

    model_config = ConfigDict(strict=True, extra="forbid", populate_by_name=True)

    user_id: str = Field(..., alias="userId")
    insight_id: str = Field(..., alias="insightId")
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp of generation.")
