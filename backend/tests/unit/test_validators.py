"""Unit tests for shared validators.

Covers biomarker range classification, CSV cell sanitisation, and UUID
validation.
"""

from __future__ import annotations

import uuid

import pytest

from src.shared.constants import BiomarkerStatus, BiomarkerType
from src.shared.exceptions import ValidationError
from src.shared.validators import (
    sanitize_csv_cell,
    validate_biomarker_value,
    validate_uuid,
)


# ---------------------------------------------------------------------------
# Biomarker value validation / range classification
# ---------------------------------------------------------------------------


class TestValidateBiomarkerValue:
    def test_validate_optimal_range(self) -> None:
        """A value within the optimal range returns OPTIMAL.

        LDL_CHOLESTEROL optimal range: 0 - 100 mg/dL.
        """
        result = validate_biomarker_value(BiomarkerType.LDL_CHOLESTEROL, 85.0)
        assert result is BiomarkerStatus.OPTIMAL

    def test_validate_borderline_range(self) -> None:
        """A value outside optimal but within borderline returns BORDERLINE.

        LDL_CHOLESTEROL borderline range: 100 - 130 mg/dL.
        A value of 115 is outside optimal (0-100) but inside borderline.
        """
        result = validate_biomarker_value(BiomarkerType.LDL_CHOLESTEROL, 115.0)
        assert result is BiomarkerStatus.BORDERLINE

    def test_validate_out_of_range(self) -> None:
        """A value outside the borderline range returns OUT_OF_RANGE.

        LDL_CHOLESTEROL borderlineHigh is 130. A value of 200 exceeds it.
        """
        result = validate_biomarker_value(BiomarkerType.LDL_CHOLESTEROL, 200.0)
        assert result is BiomarkerStatus.OUT_OF_RANGE

    def test_validate_unknown_biomarker(self) -> None:
        """An unrecognised biomarker type string raises ValidationError."""
        with pytest.raises(ValidationError, match="Unknown biomarker type"):
            validate_biomarker_value("NOT_A_REAL_BIOMARKER", 50.0)

    def test_validate_negative_value(self) -> None:
        """A negative value raises ValidationError regardless of type."""
        with pytest.raises(ValidationError, match="non-negative"):
            validate_biomarker_value(BiomarkerType.LDL_CHOLESTEROL, -1.0)

    def test_validate_with_string_type(self) -> None:
        """Passing the biomarker type as a raw string works correctly."""
        result = validate_biomarker_value("HEMOGLOBIN_A1C", 5.0)
        assert result is BiomarkerStatus.OPTIMAL

    def test_validate_boundary_value_optimal_high(self) -> None:
        """A value exactly at the optimal high boundary is OPTIMAL (inclusive)."""
        result = validate_biomarker_value(BiomarkerType.LDL_CHOLESTEROL, 100.0)
        assert result is BiomarkerStatus.OPTIMAL

    def test_validate_boundary_value_borderline_high(self) -> None:
        """A value exactly at the borderline high boundary is BORDERLINE (inclusive)."""
        result = validate_biomarker_value(BiomarkerType.LDL_CHOLESTEROL, 130.0)
        assert result is BiomarkerStatus.BORDERLINE


# ---------------------------------------------------------------------------
# CSV cell sanitisation
# ---------------------------------------------------------------------------


class TestSanitizeCsvCell:
    def test_sanitize_csv_cell_formula_injection(self) -> None:
        """Leading formula-injection characters (=, +, -, @) are stripped."""
        assert sanitize_csv_cell("=SUM(A1:A10)") == "SUM(A1:A10)"
        assert sanitize_csv_cell("+cmd|'/C calc'!A0") == "cmd|'/C calc'!A0"
        assert sanitize_csv_cell("-1+1") == "1+1"
        assert sanitize_csv_cell("@SUM(A1)") == "SUM(A1)"

    def test_sanitize_csv_cell_normal(self) -> None:
        """Normal cell values pass through unchanged (aside from whitespace trim)."""
        assert sanitize_csv_cell("Hello World") == "Hello World"
        assert sanitize_csv_cell("12345") == "12345"
        assert sanitize_csv_cell("normal text") == "normal text"


# ---------------------------------------------------------------------------
# UUID validation
# ---------------------------------------------------------------------------


class TestValidateUuid:
    def test_validate_uuid_valid(self) -> None:
        """A well-formed UUID string passes validation and is normalised."""
        test_uuid = str(uuid.uuid4())
        result = validate_uuid(test_uuid)
        assert result == test_uuid.lower()

    def test_validate_uuid_valid_uppercase(self) -> None:
        """An uppercase UUID is normalised to lowercase."""
        upper = "12345678-1234-5678-1234-567812345678".upper()
        result = validate_uuid(upper)
        assert result == "12345678-1234-5678-1234-567812345678"

    def test_validate_uuid_invalid(self) -> None:
        """A malformed string raises ValidationError."""
        with pytest.raises(ValidationError, match="Invalid UUID"):
            validate_uuid("not-a-uuid")

    def test_validate_uuid_empty(self) -> None:
        """An empty string raises ValidationError."""
        with pytest.raises(ValidationError, match="Invalid UUID"):
            validate_uuid("")
