"""Shared pytest fixtures for VitalTrack backend tests.

Uses moto to mock AWS services so that tests run entirely in-process without
any network calls.  Environment variables are set before any boto3 client is
created to ensure the mocks are picked up.
"""

from __future__ import annotations

import os
import uuid
from typing import Any, Generator

import boto3
import pytest
from moto import mock_aws

# ---------------------------------------------------------------------------
# AWS environment variables — set before any fixture creates boto3 resources
# ---------------------------------------------------------------------------

os.environ["AWS_ACCESS_KEY_ID"] = "testing"
os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
os.environ["AWS_SECURITY_TOKEN"] = "testing"
os.environ["AWS_SESSION_TOKEN"] = "testing"
os.environ["AWS_DEFAULT_REGION"] = "us-east-1"

# VitalTrack-specific env vars consumed by Settings
os.environ["STAGE"] = "test"
os.environ["BIOMARKERS_TABLE_NAME"] = "vitaltrack-biomarkers-test"
os.environ["INSIGHTS_TABLE_NAME"] = "vitaltrack-insights-test"
os.environ["AUDIT_LOG_TABLE_NAME"] = "vitaltrack-audit-test"
os.environ["DATA_BUCKET_NAME"] = "vitaltrack-data-test"
os.environ["EVENT_BUS_NAME"] = "vitaltrack-events-test"

# Table names used in fixtures
_BIOMARKERS_TABLE = "vitaltrack-biomarkers-test"
_INSIGHTS_TABLE = "vitaltrack-insights-test"
_AUDIT_TABLE = "vitaltrack-audit-test"
_DATA_BUCKET = "vitaltrack-data-test"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_table(
    dynamodb: Any,
    table_name: str,
    pk_name: str,
    sk_name: str,
) -> Any:
    """Create a DynamoDB table with the given key schema."""
    table = dynamodb.create_table(
        TableName=table_name,
        KeySchema=[
            {"AttributeName": pk_name, "KeyType": "HASH"},
            {"AttributeName": sk_name, "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": pk_name, "AttributeType": "S"},
            {"AttributeName": sk_name, "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    table.wait_until_exists()
    return table


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def sample_user_id() -> str:
    """Return a deterministic UUID string for use as a test user ID."""
    return str(uuid.UUID("12345678-1234-5678-1234-567812345678"))


@pytest.fixture()
def dynamodb_table() -> Generator[Any, None, None]:
    """Create a mocked DynamoDB biomarkers table with the VitalTrack schema.

    Yields the boto3 ``Table`` resource.
    """
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        table = _create_table(
            dynamodb,
            table_name=_BIOMARKERS_TABLE,
            pk_name="userId",
            sk_name="sk",
        )
        yield table


@pytest.fixture()
def insights_table() -> Generator[Any, None, None]:
    """Create a mocked DynamoDB insights table.

    Yields the boto3 ``Table`` resource.
    """
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        table = _create_table(
            dynamodb,
            table_name=_INSIGHTS_TABLE,
            pk_name="userId",
            sk_name="insightId",
        )
        yield table


@pytest.fixture()
def audit_table() -> Generator[Any, None, None]:
    """Create a mocked DynamoDB audit table.

    Yields the boto3 ``Table`` resource.
    """
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        table = _create_table(
            dynamodb,
            table_name=_AUDIT_TABLE,
            pk_name="pk",
            sk_name="sk",
        )
        yield table


@pytest.fixture()
def s3_bucket() -> Generator[Any, None, None]:
    """Create a mocked S3 bucket.

    Yields the bucket name (str).
    """
    with mock_aws():
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket=_DATA_BUCKET)
        yield _DATA_BUCKET
