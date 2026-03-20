"""Pydantic v2 models for biomarker CRUD operations.

Request models use ``extra='forbid'`` to reject unexpected fields. Strict mode
is intentionally disabled on request models so that JSON string values can be
coerced into StrEnum types (e.g. ``"LDL_CHOLESTEROL"`` → ``BiomarkerType``).
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from src.shared.constants import BiomarkerSource, BiomarkerStatus, BiomarkerType


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class CreateBiomarkerRequest(BaseModel):
    """Payload for creating a single biomarker record."""

    model_config = ConfigDict(extra="forbid")

    biomarker_type: BiomarkerType = Field(
        ...,
        alias="biomarkerType",
        description="The type of biomarker being recorded.",
    )
    value: float = Field(
        ...,
        gt=0,
        description="Measured biomarker value. Must be positive.",
    )
    unit: str = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Unit of measurement (e.g. mg/dL, ng/mL).",
    )
    source: BiomarkerSource = Field(
        default=BiomarkerSource.MANUAL,
        description="How the data was ingested.",
    )


class UpdateBiomarkerRequest(BaseModel):
    """Payload for updating an existing biomarker record.

    At least one field must be supplied; the handler should reject an empty
    update at the application level.
    """

    model_config = ConfigDict(extra="forbid")

    value: float | None = Field(
        default=None,
        gt=0,
        description="Updated biomarker value.",
    )
    unit: str | None = Field(
        default=None,
        min_length=1,
        max_length=20,
        description="Updated unit of measurement.",
    )


class BatchCreateRequest(BaseModel):
    """Payload for creating multiple biomarker records in one request."""

    model_config = ConfigDict(extra="forbid")

    records: list[CreateBiomarkerRequest] = Field(
        ...,
        min_length=1,
        max_length=25,
        description="List of biomarker records to create (max 25).",
    )


# ---------------------------------------------------------------------------
# DynamoDB record model
# ---------------------------------------------------------------------------


class BiomarkerRecord(BaseModel):
    """Represents a biomarker item as stored in DynamoDB."""

    model_config = ConfigDict(strict=True, extra="forbid", populate_by_name=True)

    user_id: str = Field(..., alias="userId")
    sk: str = Field(..., description="Sort key: BIOMARKER#{timestamp}#{biomarkerType}")
    biomarker_type: BiomarkerType = Field(..., alias="biomarkerType")
    value: float
    unit: str
    reference_range_low: float = Field(..., alias="referenceRangeLow")
    reference_range_high: float = Field(..., alias="referenceRangeHigh")
    status: BiomarkerStatus
    source: BiomarkerSource
    batch_id: str | None = Field(default=None, alias="batchId")
    created_at: str = Field(..., alias="createdAt")


# ---------------------------------------------------------------------------
# API response wrapper
# ---------------------------------------------------------------------------


class BiomarkerResponse(BaseModel):
    """API response envelope wrapping a single ``BiomarkerRecord``."""

    model_config = ConfigDict(strict=True, extra="forbid", populate_by_name=True)

    user_id: str = Field(..., alias="userId")
    sk: str
    biomarker_type: BiomarkerType = Field(..., alias="biomarkerType")
    value: float
    unit: str
    reference_range_low: float = Field(..., alias="referenceRangeLow")
    reference_range_high: float = Field(..., alias="referenceRangeHigh")
    status: BiomarkerStatus
    source: BiomarkerSource
    batch_id: str | None = Field(default=None, alias="batchId")
    created_at: str = Field(..., alias="createdAt")
