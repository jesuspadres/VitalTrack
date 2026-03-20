"""Unit tests for the AI insights pipeline handlers.

Covers fetch_history, insight_store, insight_notify, and insights_api.
The insight_generate handler is tested with a mocked Bedrock client.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any
from unittest.mock import MagicMock, patch

import boto3
import pytest
from moto import mock_aws

from handlers.insight_fetch_history import handler as fetch_history_handler
from handlers.insight_store import handler as store_handler
from handlers.insight_notify import handler as notify_handler
from handlers.insights_api import handler as api_handler


_BIOMARKERS_TABLE = "vitaltrack-biomarkers-test"
_INSIGHTS_TABLE = "vitaltrack-insights-test"
_USER_ID = "user-test-123"
_BATCH_ID = "batch-test-456"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _setup_dynamodb() -> None:
    """Create the biomarkers and insights tables in moto."""
    dynamodb = boto3.resource("dynamodb", region_name="us-east-1")

    dynamodb.create_table(
        TableName=_BIOMARKERS_TABLE,
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

    dynamodb.create_table(
        TableName=_INSIGHTS_TABLE,
        KeySchema=[
            {"AttributeName": "userId", "KeyType": "HASH"},
            {"AttributeName": "insightId", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "userId", "AttributeType": "S"},
            {"AttributeName": "insightId", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


def _setup_eventbridge() -> None:
    """Create the custom event bus in moto."""
    client = boto3.client("events", region_name="us-east-1")
    client.create_event_bus(Name="vitaltrack-events-test")


def _seed_biomarkers(count: int = 5) -> None:
    """Seed the biomarkers table with test records."""
    table = boto3.resource("dynamodb", region_name="us-east-1").Table(_BIOMARKERS_TABLE)
    types = [
        "LDL_CHOLESTEROL", "HDL_CHOLESTEROL", "TOTAL_CHOLESTEROL",
        "TRIGLYCERIDES", "FASTING_GLUCOSE",
    ]
    for i in range(min(count, len(types))):
        table.put_item(Item={
            "userId": _USER_ID,
            "sk": f"BIOMARKER#2026-03-19T00:00:00.{i:04d}#{types[i]}",
            "entityType": "BIOMARKER",
            "biomarkerType": types[i],
            "value": Decimal(str(50 + i * 10)),
            "unit": "mg/dL",
            "referenceRangeLow": Decimal("0"),
            "referenceRangeHigh": Decimal("100"),
            "status": "OPTIMAL",
            "source": "CSV_UPLOAD",
            "batchId": _BATCH_ID,
            "createdAt": f"2026-03-19T00:00:00.{i:04d}",
        })


def _make_api_event(
    method: str, path: str, user_id: str = _USER_ID,
    path_params: dict[str, str] | None = None,
    query_params: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a minimal API Gateway proxy event."""
    return {
        "httpMethod": method,
        "path": path,
        "pathParameters": path_params,
        "queryStringParameters": query_params,
        "headers": {"User-Agent": "test"},
        "body": json.dumps(body) if body else None,
        "requestContext": {
            "requestId": "test-request-id",
            "authorizer": {"claims": {"sub": user_id}},
            "identity": {"sourceIp": "127.0.0.1"},
        },
    }


# ---------------------------------------------------------------------------
# insight_fetch_history tests
# ---------------------------------------------------------------------------


class TestFetchHistory:
    @mock_aws
    def test_fetches_biomarker_history(self) -> None:
        _setup_dynamodb()
        _seed_biomarkers(5)

        event = {"userId": _USER_ID, "batchId": _BATCH_ID}
        result = fetch_history_handler(event, None)

        assert result["userId"] == _USER_ID
        assert result["batchId"] == _BATCH_ID
        assert result["biomarkerCount"] == 5
        assert len(result["currentResults"]) == 5
        assert len(result["biomarkerHistory"]) == 5
        # insufficientData should NOT be set when >= 3 biomarkers
        assert "insufficientData" not in result

    @mock_aws
    def test_insufficient_data_flagged(self) -> None:
        _setup_dynamodb()
        _seed_biomarkers(2)

        event = {"userId": _USER_ID, "batchId": _BATCH_ID}
        result = fetch_history_handler(event, None)

        assert result["biomarkerCount"] == 2
        assert result["insufficientData"] is True

    @mock_aws
    def test_empty_history(self) -> None:
        _setup_dynamodb()

        event = {"userId": _USER_ID, "batchId": _BATCH_ID}
        result = fetch_history_handler(event, None)

        assert result["biomarkerCount"] == 0
        assert result["insufficientData"] is True
        assert result["currentResults"] == []


# ---------------------------------------------------------------------------
# insight_store tests
# ---------------------------------------------------------------------------


class TestInsightStore:
    @mock_aws
    def test_stores_insight(self) -> None:
        _setup_dynamodb()
        _setup_eventbridge()

        event = {
            "userId": _USER_ID,
            "batchId": _BATCH_ID,
            "insight": {
                "summary": "Your biomarkers look good overall.",
                "overallScore": 85,
                "categoryScores": {},
                "riskFlags": [],
                "actionPlan": [],
                "disclaimer": "Not medical advice.",
            },
            "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0",
            "promptVersion": "v1",
        }

        result = store_handler(event, None)

        assert result["userId"] == _USER_ID
        assert result["status"] == "STORED"
        assert result["insightId"].startswith("INSIGHT#")

        # Verify the insight was written to DynamoDB
        table = boto3.resource("dynamodb", region_name="us-east-1").Table(_INSIGHTS_TABLE)
        resp = table.query(
            KeyConditionExpression="userId = :uid",
            ExpressionAttributeValues={":uid": _USER_ID},
        )
        assert resp["Count"] == 1
        item = resp["Items"][0]
        assert item["summary"] == "Your biomarkers look good overall."
        assert item["modelId"] == "anthropic.claude-3-5-sonnet-20241022-v2:0"


# ---------------------------------------------------------------------------
# insight_notify tests
# ---------------------------------------------------------------------------


class TestInsightNotify:
    @mock_aws
    def test_notify_no_topic(self) -> None:
        """When no topic ARN is configured, handler returns notified=False."""
        with patch.dict("os.environ", {"NOTIFICATION_TOPIC_ARN": ""}):
            result = notify_handler(
                {"userId": _USER_ID, "insightId": "INSIGHT#test"},
                None,
            )
        assert result["notified"] is False

    @mock_aws
    def test_notify_with_topic(self) -> None:
        """When a topic exists, handler publishes and returns notified=True."""
        sns = boto3.client("sns", region_name="us-east-1")
        topic = sns.create_topic(Name="test-notify")
        topic_arn = topic["TopicArn"]

        with patch.dict("os.environ", {"NOTIFICATION_TOPIC_ARN": topic_arn}):
            result = notify_handler(
                {"userId": _USER_ID, "insightId": "INSIGHT#test"},
                None,
            )
        assert result["notified"] is True

    def test_notify_error_does_not_raise(self) -> None:
        """Notification errors are swallowed — handler never raises."""
        with patch.dict("os.environ", {"NOTIFICATION_TOPIC_ARN": "arn:aws:sns:us-east-1:000:bad"}):
            with patch("src.handlers.insight_notify._sns_client") as mock_sns:
                mock_sns.publish.side_effect = Exception("SNS failure")
                result = notify_handler(
                    {"userId": _USER_ID, "insightId": "INSIGHT#test"},
                    None,
                )
        assert result["notified"] is False


# ---------------------------------------------------------------------------
# insights_api tests
# ---------------------------------------------------------------------------


class TestInsightsApi:
    @mock_aws
    def test_list_insights(self) -> None:
        _setup_dynamodb()
        _setup_eventbridge()

        # Seed an insight
        table = boto3.resource("dynamodb", region_name="us-east-1").Table(_INSIGHTS_TABLE)
        table.put_item(Item={
            "userId": _USER_ID,
            "insightId": "INSIGHT#2026-03-19T00:00:00#abc",
            "createdAt": "2026-03-19T00:00:00",
            "summary": "Test insight",
            "overallScore": Decimal("85"),
        })

        event = _make_api_event("GET", "/v1/insights")
        result = api_handler(event, None)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["data"]["count"] == 1

    @mock_aws
    def test_get_insight(self) -> None:
        _setup_dynamodb()
        _setup_eventbridge()

        insight_id = "INSIGHT#2026-03-19T00:00:00#abc"
        table = boto3.resource("dynamodb", region_name="us-east-1").Table(_INSIGHTS_TABLE)
        table.put_item(Item={
            "userId": _USER_ID,
            "insightId": insight_id,
            "createdAt": "2026-03-19T00:00:00",
            "summary": "Test insight",
        })

        event = _make_api_event(
            "GET", f"/v1/insights/{insight_id}",
            path_params={"insightId": insight_id},
        )
        result = api_handler(event, None)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["data"]["insightId"] == insight_id

    @mock_aws
    def test_get_insight_not_found(self) -> None:
        _setup_dynamodb()
        _setup_eventbridge()

        event = _make_api_event(
            "GET", "/v1/insights/INSIGHT#nonexistent",
            path_params={"insightId": "INSIGHT#nonexistent"},
        )
        result = api_handler(event, None)
        assert result["statusCode"] == 404

    @mock_aws
    def test_generate_trigger(self) -> None:
        _setup_dynamodb()
        _setup_eventbridge()
        _seed_biomarkers(5)

        event = _make_api_event("POST", "/v1/insights/generate")
        result = api_handler(event, None)

        assert result["statusCode"] == 202
        body = json.loads(result["body"])
        assert body["data"]["status"] == "TRIGGERED"

    @mock_aws
    def test_generate_trigger_no_data(self) -> None:
        _setup_dynamodb()
        _setup_eventbridge()

        event = _make_api_event("POST", "/v1/insights/generate")
        result = api_handler(event, None)
        assert result["statusCode"] == 400
