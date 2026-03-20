"""Shared constants for the VitalTrack backend."""

from enum import StrEnum


class BiomarkerType(StrEnum):
    """Supported biomarker types aligned with clinical panel offerings."""

    LDL_CHOLESTEROL = "LDL_CHOLESTEROL"
    HDL_CHOLESTEROL = "HDL_CHOLESTEROL"
    TOTAL_CHOLESTEROL = "TOTAL_CHOLESTEROL"
    TRIGLYCERIDES = "TRIGLYCERIDES"
    APOB = "APOB"
    HEMOGLOBIN_A1C = "HEMOGLOBIN_A1C"
    FASTING_GLUCOSE = "FASTING_GLUCOSE"
    HSCRP = "HSCRP"
    TSH = "TSH"
    FREE_T4 = "FREE_T4"
    TESTOSTERONE_TOTAL = "TESTOSTERONE_TOTAL"
    VITAMIN_D = "VITAMIN_D"
    FERRITIN = "FERRITIN"
    VITAMIN_B12 = "VITAMIN_B12"


class BiomarkerStatus(StrEnum):
    """Classification of a biomarker value relative to reference ranges."""

    OPTIMAL = "OPTIMAL"
    NORMAL = "NORMAL"
    BORDERLINE = "BORDERLINE"
    OUT_OF_RANGE = "OUT_OF_RANGE"


class BiomarkerSource(StrEnum):
    """How the biomarker data was ingested into the system."""

    MANUAL = "MANUAL"
    CSV_UPLOAD = "CSV_UPLOAD"
    API_IMPORT = "API_IMPORT"


class InsightCategory(StrEnum):
    """Categories for AI-generated health insights."""

    CARDIOVASCULAR = "CARDIOVASCULAR"
    METABOLIC = "METABOLIC"
    HORMONAL = "HORMONAL"
    NUTRITIONAL = "NUTRITIONAL"
    INFLAMMATION = "INFLAMMATION"
    GENERAL = "GENERAL"


class ActionCategory(StrEnum):
    """Categories for recommended action plan items."""

    DIET = "DIET"
    EXERCISE = "EXERCISE"
    SUPPLEMENT = "SUPPLEMENT"
    LIFESTYLE = "LIFESTYLE"
    MEDICAL = "MEDICAL"


class Trend(StrEnum):
    """Direction of change for a biomarker or category score over time."""

    IMPROVING = "IMPROVING"
    STABLE = "STABLE"
    DECLINING = "DECLINING"


class RiskSeverity(StrEnum):
    """Severity level for risk flags on biomarker readings."""

    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


# ---------------------------------------------------------------------------
# HTTP status codes
# ---------------------------------------------------------------------------

HTTP_200_OK: int = 200
HTTP_201_CREATED: int = 201
HTTP_204_NO_CONTENT: int = 204
HTTP_400_BAD_REQUEST: int = 400
HTTP_403_FORBIDDEN: int = 403
HTTP_404_NOT_FOUND: int = 404
HTTP_409_CONFLICT: int = 409
HTTP_429_TOO_MANY_REQUESTS: int = 429
HTTP_500_INTERNAL_SERVER_ERROR: int = 500
HTTP_502_BAD_GATEWAY: int = 502

# ---------------------------------------------------------------------------
# Environment variable keys for DynamoDB table names
# ---------------------------------------------------------------------------

ENV_BIOMARKERS_TABLE: str = "BIOMARKERS_TABLE_NAME"
ENV_INSIGHTS_TABLE: str = "INSIGHTS_TABLE_NAME"
ENV_AUDIT_TABLE: str = "AUDIT_LOG_TABLE_NAME"
ENV_DATA_BUCKET: str = "DATA_BUCKET_NAME"
ENV_EVENT_BUS_NAME: str = "EVENT_BUS_NAME"
ENV_STAGE: str = "STAGE"
