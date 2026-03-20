"""Shared validation utilities for VitalTrack.

Includes biomarker range checking, CSV cell sanitisation, and UUID validation.
"""

from __future__ import annotations

import json
import re
import uuid
from pathlib import Path
from typing import Any

from shared.constants import BiomarkerStatus, BiomarkerType
from shared.exceptions import ValidationError

# ---------------------------------------------------------------------------
# Biomarker reference ranges — loaded once from the bundled JSON config
# ---------------------------------------------------------------------------

_RANGES_PATH = Path(__file__).resolve().parent.parent / "config" / "biomarker_ranges.json"
_biomarker_ranges: dict[str, dict[str, Any]] | None = None


def _load_biomarker_ranges() -> dict[str, dict[str, Any]]:
    """Load and cache the biomarker reference ranges from the JSON config file."""
    global _biomarker_ranges  # noqa: PLW0603
    if _biomarker_ranges is None:
        with open(_RANGES_PATH, encoding="utf-8") as fh:
            _biomarker_ranges = json.load(fh)  # type: ignore[assignment]
    return _biomarker_ranges  # type: ignore[return-value]


def get_biomarker_range(biomarker_type: BiomarkerType) -> dict[str, Any]:
    """Return the reference range config for the given biomarker type.

    Raises ``ValidationError`` if the biomarker type is not found in the
    configuration file.
    """
    ranges = _load_biomarker_ranges()
    config = ranges.get(biomarker_type.value)
    if config is None:
        raise ValidationError(
            message=f"No reference range configured for biomarker type: {biomarker_type.value}",
        )
    return config


def get_biomarker_ranges() -> dict[str, dict[str, Any]]:
    """Return the full biomarker ranges config dict (public accessor)."""
    return _load_biomarker_ranges()


def validate_biomarker_value(
    biomarker_type: str | BiomarkerType,
    value: float,
) -> BiomarkerStatus:
    """Classify *value* against the reference ranges for *biomarker_type*.

    Returns one of:
    - ``OPTIMAL``      — within the optimal range (inclusive)
    - ``NORMAL``       — an alias; currently mapped to OPTIMAL for exact range hits
    - ``BORDERLINE``   — outside optimal but within the borderline range
    - ``OUT_OF_RANGE`` — outside the borderline range

    Raises ``ValidationError`` when *value* is negative.
    """
    if value < 0:
        raise ValidationError(
            message="Biomarker value must be non-negative.",
            details=[{"field": "value", "issue": f"received {value}, must be >= 0"}],
        )

    if isinstance(biomarker_type, str):
        try:
            biomarker_type = BiomarkerType(biomarker_type)
        except ValueError as exc:
            raise ValidationError(
                message=f"Unknown biomarker type: {biomarker_type}",
            ) from exc
    config = get_biomarker_range(biomarker_type)

    optimal_low: float = float(config["optimalLow"])
    optimal_high: float = float(config["optimalHigh"])
    borderline_low: float = float(config["borderlineLow"])
    borderline_high: float = float(config["borderlineHigh"])

    if optimal_low <= value <= optimal_high:
        return BiomarkerStatus.OPTIMAL

    if borderline_low <= value <= borderline_high:
        return BiomarkerStatus.BORDERLINE

    return BiomarkerStatus.OUT_OF_RANGE


# ---------------------------------------------------------------------------
# CSV cell sanitisation — prevent formula injection
# ---------------------------------------------------------------------------

_FORMULA_INJECTION_RE = re.compile(r"^[=+\-@]")


def sanitize_csv_cell(value: str) -> str:
    """Strip leading characters that could trigger formula injection in
    spreadsheet applications.

    Characters stripped: ``=``, ``+``, ``-``, ``@``
    """
    return _FORMULA_INJECTION_RE.sub("", value).strip()


# ---------------------------------------------------------------------------
# UUID validation
# ---------------------------------------------------------------------------


def validate_uuid(value: str) -> str:
    """Validate that *value* is a well-formed UUID (version-agnostic).

    Returns the normalised lowercase string representation.
    Raises ``ValidationError`` on failure.
    """
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError) as exc:
        raise ValidationError(
            message="Invalid UUID format.",
            details=[{"field": "id", "issue": f"'{value}' is not a valid UUID"}],
        ) from exc
    return str(parsed)
