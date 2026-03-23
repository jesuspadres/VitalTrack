"""Unit tests for the biomarker_crud Lambda handler.

Covers CRUD operations, batch creation, profile management, user isolation,
and health check. All DynamoDB interactions are mocked via moto.
"""

from __future__ import annotations

import json
import os
from typing import Any, Generator

import boto3
import pytest
from moto import mock_aws

# ---------------------------------------------------------------------------
# Environment variables MUST be set before importing any handler module,
# because module-level code (settings, logger) reads them at import time.
# The conftest.py already sets them, but we reinforce here for clarity.
# ---------------------------------------------------------------------------

os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("STAGE", "test")
os.environ.setdefault("BIOMARKERS_TABLE_NAME", "vitaltrack-biomarkers-test")
os.environ.setdefault("AUDIT_LOG_TABLE_NAME", "vitaltrack-audit-test")
os.environ.setdefault("INSIGHTS_TABLE_NAME", "vitaltrack-insights-test")
os.environ.setdefault("DATA_BUCKET_NAME", "vitaltrack-data-test")
os.environ.setdefault("EVENT_BUS_NAME", "vitaltrack-events-test")

from config.settings import get_settings  # noqa: E402
from handlers import biomarker_crud  # noqa: E402
from handlers.biomarker_crud import handler  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_BIOMARKERS_TABLE = "vitaltrack-biomarkers-test"
_AUDIT_TABLE = "vitaltrack-audit-test"
_USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
_USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_table(dynamodb: Any, table_name: str, pk: str, sk: str) -> Any:
    """Create a DynamoDB table with the given composite key."""
    table = dynamodb.create_table(
        TableName=table_name,
        KeySchema=[
            {"AttributeName": pk, "KeyType": "HASH"},
            {"AttributeName": sk, "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": pk, "AttributeType": "S"},
            {"AttributeName": sk, "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    table.wait_until_exists()
    return table


def _api_event(
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    user_id: str = _USER_A,
    path_parameters: dict[str, str] | None = None,
    query_string_parameters: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Build a minimal API Gateway proxy integration event."""
    event: dict[str, Any] = {
        "httpMethod": method,
        "path": path,
        "headers": {"User-Agent": "test-agent"},
        "pathParameters": path_parameters,
        "queryStringParameters": query_string_parameters,
        "requestContext": {
            "requestId": "test-request-id",
            "authorizer": {
                "claims": {"sub": user_id},
            },
            "identity": {"sourceIp": "127.0.0.1"},
        },
        "body": json.dumps(body) if body else None,
    }
    return event


def _parse_body(response: dict[str, Any]) -> dict[str, Any]:
    """Parse the JSON body from a Lambda proxy response."""
    return json.loads(response["body"])


# ---------------------------------------------------------------------------
# Fixture: mocked DynamoDB with both biomarkers and audit tables
# ---------------------------------------------------------------------------


@pytest.fixture()
def ddb_tables() -> Generator[Any, None, None]:
    """Spin up moto-mocked DynamoDB with the biomarkers and audit tables.

    Resets the module-level table cache and the settings LRU cache so each
    test gets a clean slate.
    """
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")

        bio_table = _create_table(dynamodb, _BIOMARKERS_TABLE, "userId", "sk")
        _create_table(dynamodb, _AUDIT_TABLE, "pk", "sk")

        # Reset the module-level cache so the handler picks up the moto table
        biomarker_crud._table = None
        get_settings.cache_clear()

        yield bio_table

        # Clean up after the test
        biomarker_crud._table = None
        get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


class TestHealthCheck:
    def test_health_check(self, ddb_tables: Any) -> None:
        """GET /health returns 200 with status=healthy."""
        event = _api_event("GET", "/health")
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["success"] is True
        assert body["data"]["status"] == "healthy"
        assert body["data"]["service"] == "vitaltrack"


# ---------------------------------------------------------------------------
# Create biomarker
# ---------------------------------------------------------------------------


class TestCreateBiomarker:
    def test_create_biomarker_success(self, ddb_tables: Any) -> None:
        """Valid POST creates a record in DynamoDB and returns 201."""
        event = _api_event(
            "POST",
            "/v1/biomarkers",
            body={
                "biomarkerType": "LDL_CHOLESTEROL",
                "value": 95.0,
                "unit": "mg/dL",
            },
        )
        response = handler(event, None)

        assert response["statusCode"] == 201
        body = _parse_body(response)
        assert body["success"] is True
        data = body["data"]
        assert data["biomarkerType"] == "LDL_CHOLESTEROL"
        assert data["status"] == "NORMAL"  # 95 is in-range but near the edge
        assert data["userId"] == _USER_A
        assert data["sk"].startswith("BIOMARKER#")

        # Verify the record actually landed in DynamoDB
        result = ddb_tables.get_item(
            Key={"userId": _USER_A, "sk": data["sk"]}
        )
        assert result.get("Item") is not None

    def test_create_biomarker_invalid_type(self, ddb_tables: Any) -> None:
        """POST with an unknown biomarkerType returns a 400 validation error."""
        event = _api_event(
            "POST",
            "/v1/biomarkers",
            body={
                "biomarkerType": "MADE_UP_MARKER",
                "value": 10.0,
                "unit": "mg/dL",
            },
        )
        response = handler(event, None)

        assert response["statusCode"] == 400
        body = _parse_body(response)
        assert body["success"] is False

    def test_create_biomarker_negative_value(self, ddb_tables: Any) -> None:
        """POST with a negative value returns a 400 validation error."""
        event = _api_event(
            "POST",
            "/v1/biomarkers",
            body={
                "biomarkerType": "LDL_CHOLESTEROL",
                "value": -5.0,
                "unit": "mg/dL",
            },
        )
        response = handler(event, None)

        assert response["statusCode"] == 400
        body = _parse_body(response)
        assert body["success"] is False


# ---------------------------------------------------------------------------
# Get biomarker
# ---------------------------------------------------------------------------


class TestGetBiomarker:
    def _seed_biomarker(self, table: Any, user_id: str = _USER_A) -> str:
        """Insert a sample biomarker record and return its sort key."""
        sk = "BIOMARKER#2025-01-01T00:00:00+00:00#LDL_CHOLESTEROL"
        table.put_item(
            Item={
                "userId": user_id,
                "sk": sk,
                "entityType": "BIOMARKER",
                "biomarkerType": "LDL_CHOLESTEROL",
                "value": 90,
                "unit": "mg/dL",
                "referenceRangeLow": 0,
                "referenceRangeHigh": 100,
                "status": "OPTIMAL",
                "source": "MANUAL",
                "createdAt": "2025-01-01T00:00:00+00:00",
            }
        )
        return sk

    def test_get_biomarker_success(self, ddb_tables: Any) -> None:
        """GET with a valid sk retrieves the existing record."""
        sk = self._seed_biomarker(ddb_tables)
        event = _api_event(
            "GET",
            f"/v1/biomarkers/{sk}",
            path_parameters={"sk": sk},
        )
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["success"] is True
        assert body["data"]["sk"] == sk
        assert body["data"]["biomarkerType"] == "LDL_CHOLESTEROL"

    def test_get_biomarker_not_found(self, ddb_tables: Any) -> None:
        """GET with a non-existent sk returns 404."""
        sk = "BIOMARKER#nonexistent#LDL_CHOLESTEROL"
        event = _api_event(
            "GET",
            f"/v1/biomarkers/{sk}",
            path_parameters={"sk": sk},
        )
        response = handler(event, None)

        assert response["statusCode"] == 404
        body = _parse_body(response)
        assert body["success"] is False
        assert body["error"]["code"] == "NOT_FOUND"


# ---------------------------------------------------------------------------
# List biomarkers
# ---------------------------------------------------------------------------


class TestListBiomarkers:
    def test_list_biomarkers(self, ddb_tables: Any) -> None:
        """GET /v1/biomarkers returns a paginated list filtered to the user."""
        # Seed several records
        for i in range(3):
            ddb_tables.put_item(
                Item={
                    "userId": _USER_A,
                    "sk": f"BIOMARKER#2025-01-0{i + 1}T00:00:00+00:00#LDL_CHOLESTEROL",
                    "entityType": "BIOMARKER",
                    "biomarkerType": "LDL_CHOLESTEROL",
                    "value": 80 + i,
                    "unit": "mg/dL",
                    "referenceRangeLow": 0,
                    "referenceRangeHigh": 100,
                    "status": "OPTIMAL",
                    "source": "MANUAL",
                    "createdAt": f"2025-01-0{i + 1}T00:00:00+00:00",
                }
            )

        event = _api_event(
            "GET",
            "/v1/biomarkers",
            query_string_parameters={"limit": "10"},
        )
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["success"] is True
        assert len(body["data"]) == 3
        assert body["meta"]["pagination"]["limit"] == 10


# ---------------------------------------------------------------------------
# Update biomarker
# ---------------------------------------------------------------------------


class TestUpdateBiomarker:
    def _seed_biomarker(self, table: Any) -> str:
        """Insert a sample biomarker and return its sk."""
        sk = "BIOMARKER#2025-01-01T00:00:00+00:00#LDL_CHOLESTEROL"
        table.put_item(
            Item={
                "userId": _USER_A,
                "sk": sk,
                "entityType": "BIOMARKER",
                "biomarkerType": "LDL_CHOLESTEROL",
                "value": 90,
                "unit": "mg/dL",
                "referenceRangeLow": 0,
                "referenceRangeHigh": 100,
                "status": "OPTIMAL",
                "source": "MANUAL",
                "createdAt": "2025-01-01T00:00:00+00:00",
            }
        )
        return sk

    def test_update_biomarker_success(self, ddb_tables: Any) -> None:
        """PUT with a new value updates the record and recalculates status."""
        sk = self._seed_biomarker(ddb_tables)
        event = _api_event(
            "PUT",
            f"/v1/biomarkers/{sk}",
            body={"value": 135.0},
            path_parameters={"sk": sk},
        )
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["success"] is True
        # 135 is outside optimal (0-100) but inside borderline (100-130)?
        # Actually 135 > 130 so it's OUT_OF_RANGE
        assert body["data"]["status"] == "OUT_OF_RANGE"

    def test_update_biomarker_empty_body(self, ddb_tables: Any) -> None:
        """PUT with no updatable fields returns 400."""
        sk = self._seed_biomarker(ddb_tables)
        event = _api_event(
            "PUT",
            f"/v1/biomarkers/{sk}",
            body={},
            path_parameters={"sk": sk},
        )
        response = handler(event, None)

        assert response["statusCode"] == 400
        body = _parse_body(response)
        assert body["success"] is False


# ---------------------------------------------------------------------------
# Delete biomarker
# ---------------------------------------------------------------------------


class TestDeleteBiomarker:
    def _seed_biomarker(self, table: Any) -> str:
        sk = "BIOMARKER#2025-01-01T00:00:00+00:00#LDL_CHOLESTEROL"
        table.put_item(
            Item={
                "userId": _USER_A,
                "sk": sk,
                "entityType": "BIOMARKER",
                "biomarkerType": "LDL_CHOLESTEROL",
                "value": 90,
                "unit": "mg/dL",
                "referenceRangeLow": 0,
                "referenceRangeHigh": 100,
                "status": "OPTIMAL",
                "source": "MANUAL",
                "createdAt": "2025-01-01T00:00:00+00:00",
            }
        )
        return sk

    def test_delete_biomarker_success(self, ddb_tables: Any) -> None:
        """DELETE removes the record and returns confirmation."""
        sk = self._seed_biomarker(ddb_tables)
        event = _api_event(
            "DELETE",
            f"/v1/biomarkers/{sk}",
            path_parameters={"sk": sk},
        )
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["success"] is True
        assert body["data"]["deleted"] is True

        # Verify the record is gone
        result = ddb_tables.get_item(Key={"userId": _USER_A, "sk": sk})
        assert result.get("Item") is None

    def test_delete_biomarker_not_found(self, ddb_tables: Any) -> None:
        """DELETE for a non-existent sk returns 404."""
        sk = "BIOMARKER#nonexistent#LDL_CHOLESTEROL"
        event = _api_event(
            "DELETE",
            f"/v1/biomarkers/{sk}",
            path_parameters={"sk": sk},
        )
        response = handler(event, None)

        assert response["statusCode"] == 404
        body = _parse_body(response)
        assert body["success"] is False
        assert body["error"]["code"] == "NOT_FOUND"


# ---------------------------------------------------------------------------
# Batch create
# ---------------------------------------------------------------------------


class TestBatchCreate:
    def test_batch_create_success(self, ddb_tables: Any) -> None:
        """POST /v1/biomarkers/batch creates multiple records."""
        records = [
            {"biomarkerType": "LDL_CHOLESTEROL", "value": 95.0, "unit": "mg/dL"},
            {"biomarkerType": "HDL_CHOLESTEROL", "value": 55.0, "unit": "mg/dL"},
            {"biomarkerType": "TRIGLYCERIDES", "value": 120.0, "unit": "mg/dL"},
        ]
        event = _api_event(
            "POST",
            "/v1/biomarkers/batch",
            body={"records": records},
        )
        response = handler(event, None)

        assert response["statusCode"] == 201
        body = _parse_body(response)
        assert body["success"] is True
        assert body["data"]["count"] == 3
        assert "batchId" in body["data"]
        assert len(body["data"]["records"]) == 3

    def test_batch_create_exceeds_limit(self, ddb_tables: Any) -> None:
        """POST /v1/biomarkers/batch with >25 records returns 400."""
        records = [
            {"biomarkerType": "LDL_CHOLESTEROL", "value": 95.0, "unit": "mg/dL"}
            for _ in range(26)
        ]
        event = _api_event(
            "POST",
            "/v1/biomarkers/batch",
            body={"records": records},
        )
        response = handler(event, None)

        assert response["statusCode"] == 400
        body = _parse_body(response)
        assert body["success"] is False


# ---------------------------------------------------------------------------
# User isolation
# ---------------------------------------------------------------------------


class TestUserIsolation:
    def test_user_isolation(self, ddb_tables: Any) -> None:
        """User A cannot read User B's biomarkers via the list endpoint.

        Records are partitioned by userId so a query for user A will never
        return user B's data.
        """
        # Seed a record for user B
        sk_b = "BIOMARKER#2025-01-01T00:00:00+00:00#LDL_CHOLESTEROL"
        ddb_tables.put_item(
            Item={
                "userId": _USER_B,
                "sk": sk_b,
                "entityType": "BIOMARKER",
                "biomarkerType": "LDL_CHOLESTEROL",
                "value": 90,
                "unit": "mg/dL",
                "referenceRangeLow": 0,
                "referenceRangeHigh": 100,
                "status": "OPTIMAL",
                "source": "MANUAL",
                "createdAt": "2025-01-01T00:00:00+00:00",
            }
        )

        # User A lists biomarkers — should see nothing
        event = _api_event("GET", "/v1/biomarkers", user_id=_USER_A)
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["success"] is True
        assert len(body["data"]) == 0

        # User A tries to GET user B's record directly — the key doesn't match
        event = _api_event(
            "GET",
            f"/v1/biomarkers/{sk_b}",
            path_parameters={"sk": sk_b},
            user_id=_USER_A,
        )
        response = handler(event, None)

        # DynamoDB get_item with userId=_USER_A won't find the item keyed to _USER_B
        assert response["statusCode"] == 404


# ---------------------------------------------------------------------------
# Profile management
# ---------------------------------------------------------------------------


class TestProfile:
    def test_get_profile_creates_default(self, ddb_tables: Any) -> None:
        """GET /v1/profile creates a default profile on first access."""
        event = _api_event("GET", "/v1/profile")
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["success"] is True
        data = body["data"]
        assert data["userId"] == _USER_A
        assert data["sk"] == "PROFILE"
        assert data["tier"] == "free"
        assert data["unitsPreference"] == "metric"
        assert data["notificationsEnabled"] is True

        # Verify persisted in DynamoDB
        result = ddb_tables.get_item(
            Key={"userId": _USER_A, "sk": "PROFILE"}
        )
        assert result["Item"]["tier"] == "free"

    def test_update_profile(self, ddb_tables: Any) -> None:
        """PUT /v1/profile updates allowed fields."""
        # First create a default profile
        get_event = _api_event("GET", "/v1/profile")
        handler(get_event, None)

        # Now update it
        event = _api_event(
            "PUT",
            "/v1/profile",
            body={
                "displayName": "Test User",
                "unitsPreference": "imperial",
                "notificationsEnabled": False,
            },
        )
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["success"] is True
        assert body["data"]["displayName"] == "Test User"
        assert body["data"]["unitsPreference"] == "imperial"
        assert body["data"]["notificationsEnabled"] is False
