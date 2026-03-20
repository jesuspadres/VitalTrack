"""Pydantic v2 models for AI-generated health insights.

These models define the contract between the Bedrock inference step and the
rest of the system, as well as the DynamoDB storage representation.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from shared.constants import (
    ActionCategory,
    InsightCategory,
    RiskSeverity,
    Trend,
)


# ---------------------------------------------------------------------------
# Composite value objects used inside insight responses
# ---------------------------------------------------------------------------


class RiskFlag(BaseModel):
    """A single risk flag raised by the AI analysis."""

    model_config = ConfigDict(extra="forbid")

    biomarker: str = Field(..., description="Biomarker type that triggered the flag.")
    severity: RiskSeverity
    message: str = Field(..., min_length=1, description="Human-readable risk explanation.")


class ActionPlanItem(BaseModel):
    """A single recommended action from the AI-generated action plan."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    priority: int = Field(..., ge=1, description="Priority rank (1 = highest).")
    category: ActionCategory
    title: str = Field(..., min_length=1, max_length=120)
    description: str = Field(..., min_length=1, max_length=1000)
    relevant_biomarkers: list[str] = Field(
        ...,
        alias="relevantBiomarkers",
        description="Biomarker types this action targets.",
    )
    timeframe: str = Field(
        ...,
        min_length=1,
        max_length=60,
        description="Expected timeframe for impact (e.g. '2-4 weeks').",
    )


class CategoryScore(BaseModel):
    """Health score and trend for a single insight category."""

    model_config = ConfigDict(extra="forbid")

    score: int = Field(..., ge=0, le=100)
    trend: Trend


# ---------------------------------------------------------------------------
# API response model — matches the Bedrock output schema (Section 7.2)
# ---------------------------------------------------------------------------


class InsightResponse(BaseModel):
    """Structured AI insight returned to the client."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    summary: str = Field(..., max_length=280, description="Short AI-generated summary.")
    overall_score: int = Field(
        ...,
        ge=0,
        le=100,
        alias="overallScore",
        description="Composite health score.",
    )
    category_scores: dict[str, CategoryScore] = Field(
        ...,
        alias="categoryScores",
        description="Per-category scores keyed by InsightCategory value.",
    )
    risk_flags: list[RiskFlag] = Field(
        ...,
        alias="riskFlags",
    )
    action_plan: list[ActionPlanItem] = Field(
        ...,
        alias="actionPlan",
    )
    disclaimer: str = Field(
        ...,
        min_length=1,
        description="Medical disclaimer that must accompany every insight.",
    )


# ---------------------------------------------------------------------------
# DynamoDB record model
# ---------------------------------------------------------------------------


class InsightRecord(BaseModel):
    """Represents an insight item as stored in DynamoDB."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    user_id: str = Field(..., alias="userId")
    insight_id: str = Field(
        ...,
        alias="insightId",
        description="Sort key: INSIGHT#{timestamp}#{uuid}",
    )
    created_at: str = Field(..., alias="createdAt")
    source_batch_id: str = Field(
        ...,
        alias="sourceBatchId",
        description="Reference to the biomarker batch that triggered this insight.",
    )
    category: InsightCategory
    summary: str = Field(..., max_length=280)
    full_analysis: str = Field(..., alias="fullAnalysis")
    action_plan: list[ActionPlanItem] = Field(..., alias="actionPlan")
    risk_flags: list[RiskFlag] = Field(..., alias="riskFlags")
    model_id: str = Field(..., alias="modelId", description="Bedrock model identifier used.")
    prompt_version: str = Field(
        ...,
        alias="promptVersion",
        description="Version tag of the prompt template.",
    )
