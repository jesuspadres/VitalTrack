"""Unit tests for the CSV parser Lambda handler.

Covers CSV parsing, row validation, S3/DynamoDB integration, and
EventBridge event publishing — all using moto mocks.
"""

from __future__ import annotations

import csv
import io
import json
from typing import Any
from unittest.mock import patch

import boto3
import pytest
from moto import mock_aws

from src.handlers.csv_parser import (
    _parse_csv,
    _validate_and_convert_rows,
    handler,
)
from src.shared.exceptions import ValidationError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_csv(*rows: dict[str, str]) -> str:
    """Build a CSV string from a list of row dicts."""
    if not rows:
        return ""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return output.getvalue()


def _make_eventbridge_event(bucket: str, key: str) -> dict[str, Any]:
    """Build a minimal EventBridge S3 Object Created event."""
    return {
        "source": "aws.s3",
        "detail-type": "Object Created",
        "detail": {
            "bucket": {"name": bucket},
            "object": {"key": key},
        },
    }


def _make_s3_event(bucket: str, key: str) -> dict[str, Any]:
    """Build a direct S3 event (fallback format)."""
    return {
        "Records": [
            {
                "s3": {
                    "bucket": {"name": bucket},
                    "object": {"key": key},
                },
            },
        ],
    }


VALID_ROW = {"biomarkerType": "LDL_CHOLESTEROL", "value": "95", "unit": "mg/dL"}

_BUCKET = "vitaltrack-data-test"
_USER_ID = "user-abc-123"
_BATCH_ID = "batch-def-456"
_KEY = f"uploads/{_USER_ID}/{_BATCH_ID}/results.csv"


# ---------------------------------------------------------------------------
# _parse_csv — unit tests
# ---------------------------------------------------------------------------


class TestParseCsv:
    def test_valid_csv(self) -> None:
        content = _make_csv(VALID_ROW)
        rows = _parse_csv(content)
        assert len(rows) == 1
        assert rows[0]["biomarkerType"] == "LDL_CHOLESTEROL"
        assert rows[0]["value"] == "95"

    def test_multiple_rows(self) -> None:
        rows_data = [
            {"biomarkerType": "LDL_CHOLESTEROL", "value": "95", "unit": "mg/dL"},
            {"biomarkerType": "HDL_CHOLESTEROL", "value": "55", "unit": "mg/dL"},
        ]
        content = _make_csv(*rows_data)
        rows = _parse_csv(content)
        assert len(rows) == 2

    def test_missing_header_raises(self) -> None:
        with pytest.raises(ValidationError, match="no header row"):
            _parse_csv("")

    def test_missing_required_column(self) -> None:
        content = "biomarkerType,value\nLDL_CHOLESTEROL,95\n"
        with pytest.raises(ValidationError, match="missing required columns"):
            _parse_csv(content)

    def test_empty_data_rows(self) -> None:
        content = "biomarkerType,value,unit\n,,\n"
        with pytest.raises(ValidationError, match="no data rows"):
            _parse_csv(content)

    def test_whitespace_headers_normalized(self) -> None:
        content = " biomarkerType , value , unit \nLDL_CHOLESTEROL,95,mg/dL\n"
        rows = _parse_csv(content)
        assert len(rows) == 1
        assert rows[0]["biomarkerType"] == "LDL_CHOLESTEROL"

    def test_formula_injection_sanitized(self) -> None:
        content = "biomarkerType,value,unit\n=LDL_CHOLESTEROL,95,mg/dL\n"
        rows = _parse_csv(content)
        # Leading '=' should be stripped by sanitize_csv_cell
        assert rows[0]["biomarkerType"] == "LDL_CHOLESTEROL"

    def test_skips_empty_rows(self) -> None:
        content = "biomarkerType,value,unit\nLDL_CHOLESTEROL,95,mg/dL\n,,\nHDL_CHOLESTEROL,55,mg/dL\n"
        rows = _parse_csv(content)
        assert len(rows) == 2


# ---------------------------------------------------------------------------
# _validate_and_convert_rows — unit tests
# ---------------------------------------------------------------------------


class TestValidateAndConvertRows:
    def test_valid_single_row(self) -> None:
        rows = [VALID_ROW]
        items = _validate_and_convert_rows(rows, _USER_ID, _BATCH_ID)
        assert len(items) == 1
        item = items[0]
        assert item["userId"] == _USER_ID
        assert item["batchId"] == _BATCH_ID
        assert item["biomarkerType"] == "LDL_CHOLESTEROL"
        assert item["entityType"] == "BIOMARKER"
        assert item["source"] == "CSV_UPLOAD"
        assert "sk" in item

    def test_invalid_biomarker_type(self) -> None:
        rows = [{"biomarkerType": "FAKE_TYPE", "value": "10", "unit": "mg/dL"}]
        with pytest.raises(ValidationError, match="1 invalid row"):
            _validate_and_convert_rows(rows, _USER_ID, _BATCH_ID)

    def test_invalid_numeric_value(self) -> None:
        rows = [{"biomarkerType": "LDL_CHOLESTEROL", "value": "abc", "unit": "mg/dL"}]
        with pytest.raises(ValidationError, match="1 invalid row"):
            _validate_and_convert_rows(rows, _USER_ID, _BATCH_ID)

    def test_negative_value(self) -> None:
        rows = [{"biomarkerType": "LDL_CHOLESTEROL", "value": "-5", "unit": "mg/dL"}]
        with pytest.raises(ValidationError, match="1 invalid row"):
            _validate_and_convert_rows(rows, _USER_ID, _BATCH_ID)

    def test_missing_unit(self) -> None:
        rows = [{"biomarkerType": "LDL_CHOLESTEROL", "value": "95", "unit": ""}]
        with pytest.raises(ValidationError, match="1 invalid row"):
            _validate_and_convert_rows(rows, _USER_ID, _BATCH_ID)

    def test_duplicate_detection(self) -> None:
        rows = [
            {"biomarkerType": "LDL_CHOLESTEROL", "value": "95", "unit": "mg/dL"},
            {"biomarkerType": "LDL_CHOLESTEROL", "value": "95", "unit": "mg/dL"},
        ]
        with pytest.raises(ValidationError, match="1 invalid row") as exc_info:
            _validate_and_convert_rows(rows, _USER_ID, _BATCH_ID)
        assert any("Duplicate" in d["issue"] for d in exc_info.value.details)

    def test_multiple_errors_reported(self) -> None:
        rows = [
            {"biomarkerType": "FAKE", "value": "10", "unit": "mg/dL"},
            {"biomarkerType": "LDL_CHOLESTEROL", "value": "abc", "unit": "mg/dL"},
        ]
        with pytest.raises(ValidationError, match="2 invalid row"):
            _validate_and_convert_rows(rows, _USER_ID, _BATCH_ID)

    def test_status_classification(self) -> None:
        """Items have correct status based on reference ranges."""
        rows = [
            {"biomarkerType": "LDL_CHOLESTEROL", "value": "50", "unit": "mg/dL"},
        ]
        items = _validate_and_convert_rows(rows, _USER_ID, _BATCH_ID)
        assert items[0]["status"] == "OPTIMAL"


# ---------------------------------------------------------------------------
# handler — integration tests with moto
# ---------------------------------------------------------------------------


class TestCsvParserHandler:
    """Integration tests wiring up S3, DynamoDB, and EventBridge via moto."""

    @mock_aws
    def test_handler_success(self) -> None:
        """A valid CSV upload writes records to DynamoDB and returns 200."""
        self._setup_infra()
        csv_content = _make_csv(VALID_ROW)
        self._upload_csv(csv_content)
        self._create_upload_record()

        event = _make_eventbridge_event(_BUCKET, _KEY)
        result = handler(event, None)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["status"] == "COMPLETED"
        assert body["recordCount"] == 1

        # Verify the biomarker was written to DynamoDB
        table = boto3.resource("dynamodb", region_name="us-east-1").Table(
            "vitaltrack-biomarkers-test"
        )
        resp = table.query(
            KeyConditionExpression="userId = :uid AND begins_with(sk, :prefix)",
            ExpressionAttributeValues={":uid": _USER_ID, ":prefix": "BIOMARKER#"},
        )
        assert resp["Count"] == 1

    @mock_aws
    def test_handler_validation_error(self) -> None:
        """A CSV with invalid rows returns 400 and updates batch status to FAILED."""
        self._setup_infra()
        csv_content = "biomarkerType,value,unit\nFAKE_TYPE,abc,\n"
        self._upload_csv(csv_content)
        self._create_upload_record()

        event = _make_eventbridge_event(_BUCKET, _KEY)
        result = handler(event, None)

        assert result["statusCode"] == 400
        body = json.loads(result["body"])
        assert "error" in body

    @mock_aws
    def test_handler_s3_event_format(self) -> None:
        """Handler also supports direct S3 event format (fallback)."""
        self._setup_infra()
        csv_content = _make_csv(VALID_ROW)
        self._upload_csv(csv_content)
        self._create_upload_record()

        event = _make_s3_event(_BUCKET, _KEY)
        result = handler(event, None)

        assert result["statusCode"] == 200

    @mock_aws
    def test_handler_invalid_key_format(self) -> None:
        """An S3 key without the uploads/ prefix returns 400."""
        self._setup_infra()
        event = _make_eventbridge_event(_BUCKET, "invalid/path/file.csv")
        result = handler(event, None)
        assert result["statusCode"] == 400

    @mock_aws
    def test_handler_missing_s3_info(self) -> None:
        """An event with no bucket/key data returns 400."""
        self._setup_infra()
        result = handler({"detail": {}}, None)
        assert result["statusCode"] == 400

    @mock_aws
    def test_handler_multiple_rows_success(self) -> None:
        """Multiple valid rows are all written to DynamoDB."""
        self._setup_infra()
        rows = [
            {"biomarkerType": "LDL_CHOLESTEROL", "value": "95", "unit": "mg/dL"},
            {"biomarkerType": "HDL_CHOLESTEROL", "value": "55", "unit": "mg/dL"},
            {"biomarkerType": "FASTING_GLUCOSE", "value": "90", "unit": "mg/dL"},
        ]
        csv_content = _make_csv(*rows)
        self._upload_csv(csv_content)
        self._create_upload_record()

        event = _make_eventbridge_event(_BUCKET, _KEY)
        result = handler(event, None)

        body = json.loads(result["body"])
        assert body["recordCount"] == 3

    @mock_aws
    def test_handler_updates_batch_status(self) -> None:
        """Batch status progresses from PENDING to COMPLETED."""
        self._setup_infra()
        csv_content = _make_csv(VALID_ROW)
        self._upload_csv(csv_content)
        self._create_upload_record()

        event = _make_eventbridge_event(_BUCKET, _KEY)
        handler(event, None)

        table = boto3.resource("dynamodb", region_name="us-east-1").Table(
            "vitaltrack-biomarkers-test"
        )
        resp = table.get_item(
            Key={"userId": _USER_ID, "sk": f"UPLOAD#{_BATCH_ID}"}
        )
        assert resp["Item"]["status"] == "COMPLETED"
        assert resp["Item"]["recordCount"] == 1

    # --- Setup helpers ---

    @staticmethod
    def _setup_infra() -> None:
        """Create S3 bucket, DynamoDB table, and EventBridge bus in moto."""
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket=_BUCKET)

        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        dynamodb.create_table(
            TableName="vitaltrack-biomarkers-test",
            KeySchema=[
                {"AttributeName": "userId", "KeyType": "HASH"},
                {"AttributeName": "sk", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "userId", "AttributeType": "S"},
                {"AttributeName": "sk", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        events_client = boto3.client("events", region_name="us-east-1")
        events_client.create_event_bus(Name="vitaltrack-events-test")

    @staticmethod
    def _upload_csv(content: str) -> None:
        """Upload a CSV file to the mocked S3 bucket."""
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.put_object(Bucket=_BUCKET, Key=_KEY, Body=content.encode("utf-8"))

    @staticmethod
    def _create_upload_record() -> None:
        """Create the UPLOAD batch status record that the handler expects."""
        table = boto3.resource("dynamodb", region_name="us-east-1").Table(
            "vitaltrack-biomarkers-test"
        )
        table.put_item(
            Item={
                "userId": _USER_ID,
                "sk": f"UPLOAD#{_BATCH_ID}",
                "entityType": "UPLOAD",
                "batchId": _BATCH_ID,
                "status": "PENDING",
                "filename": "results.csv",
            }
        )
