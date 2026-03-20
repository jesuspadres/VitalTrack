"""Seed script for local development — populates DynamoDB with sample biomarker data."""

import json
import uuid
from datetime import datetime, timedelta, timezone

import boto3

STAGE = "dev"
REGION = "us-east-1"
TABLE_NAME = f"vitaltrack-biomarkers-{STAGE}"

SAMPLE_USER_ID = "seed-user-00000000-0000-0000-0000-000000000001"

SAMPLE_BIOMARKERS = [
    {"type": "LDL_CHOLESTEROL", "unit": "mg/dL", "values": [95, 102, 98], "low": 0, "high": 100},
    {"type": "HDL_CHOLESTEROL", "unit": "mg/dL", "values": [55, 52, 58], "low": 40, "high": 90},
    {"type": "TOTAL_CHOLESTEROL", "unit": "mg/dL", "values": [185, 192, 180], "low": 125, "high": 200},
    {"type": "TRIGLYCERIDES", "unit": "mg/dL", "values": [120, 135, 115], "low": 0, "high": 150},
    {"type": "HEMOGLOBIN_A1C", "unit": "%", "values": [5.4, 5.5, 5.3], "low": 4.0, "high": 5.6},
    {"type": "FASTING_GLUCOSE", "unit": "mg/dL", "values": [92, 95, 88], "low": 70, "high": 100},
    {"type": "HSCRP", "unit": "mg/L", "values": [0.8, 1.2, 0.6], "low": 0, "high": 1.0},
    {"type": "TSH", "unit": "uIU/mL", "values": [2.1, 2.5, 1.9], "low": 0.5, "high": 4.0},
    {"type": "VITAMIN_D", "unit": "ng/mL", "values": [35, 28, 42], "low": 30, "high": 80},
    {"type": "FERRITIN", "unit": "ng/mL", "values": [85, 72, 90], "low": 30, "high": 300},
]


def determine_status(value: float, low: float, high: float) -> str:
    if low <= value <= high:
        return "OPTIMAL"
    borderline_margin = (high - low) * 0.3
    if (low - borderline_margin) <= value <= (high + borderline_margin):
        return "BORDERLINE"
    return "OUT_OF_RANGE"


def main() -> None:
    dynamodb = boto3.resource("dynamodb", region_name=REGION)
    table = dynamodb.Table(TABLE_NAME)

    now = datetime.now(timezone.utc)
    batch_id = str(uuid.uuid4())
    items_written = 0

    # Write user profile
    table.put_item(
        Item={
            "userId": SAMPLE_USER_ID,
            "sk": "PROFILE",
            "entityType": "PROFILE",
            "email": "seed-user@vitaltrack.dev",
            "displayName": "Seed User",
            "tier": "free",
            "unitsPreference": "metric",
            "notificationsEnabled": True,
            "createdAt": now.isoformat(),
        }
    )
    print(f"Created profile for {SAMPLE_USER_ID}")

    # Write biomarker records (3 per type, spaced 30 days apart)
    for biomarker in SAMPLE_BIOMARKERS:
        for i, value in enumerate(biomarker["values"]):
            timestamp = (now - timedelta(days=30 * i)).isoformat()
            sk = f"BIOMARKER#{timestamp}#{biomarker['type']}"
            status = determine_status(value, biomarker["low"], biomarker["high"])

            table.put_item(
                Item={
                    "userId": SAMPLE_USER_ID,
                    "sk": sk,
                    "entityType": "BIOMARKER",
                    "biomarkerType": biomarker["type"],
                    "value": json.loads(json.dumps(value)),  # Ensure Decimal compat
                    "unit": biomarker["unit"],
                    "referenceRangeLow": json.loads(json.dumps(biomarker["low"])),
                    "referenceRangeHigh": json.loads(json.dumps(biomarker["high"])),
                    "status": status,
                    "source": "MANUAL",
                    "batchId": batch_id if i == 0 else str(uuid.uuid4()),
                    "createdAt": timestamp,
                }
            )
            items_written += 1

    print(f"Seeded {items_written} biomarker records across {len(SAMPLE_BIOMARKERS)} types")
    print(f"Batch ID (latest): {batch_id}")
    print("Done!")


if __name__ == "__main__":
    main()
