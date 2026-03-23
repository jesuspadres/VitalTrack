"""Seed script for local development — populates DynamoDB with sample biomarker data.

Generates 8 data points per biomarker type over ~7 months, with realistic clinical
progression narratives (e.g., Vitamin D improving over summer, LDL spiking then
recovering with dietary changes).
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3

STAGE = "dev"
REGION = "us-east-1"
TABLE_NAME = f"vitaltrack-biomarkers-{STAGE}"

SAMPLE_USER_ID = "seed-user-00000000-0000-0000-0000-000000000001"

# ─── Biomarker data: 8 values each, newest first ───────────────────────────
# Realistic progressions that tell a clinical story when charted together.
SAMPLE_BIOMARKERS = [
    # Cardiovascular
    {
        "type": "LDL_CHOLESTEROL",
        "unit": "mg/dL",
        "values": [92, 95, 108, 118, 125, 115, 102, 98],
        "low": 0,
        "high": 100,
    },
    {
        "type": "HDL_CHOLESTEROL",
        "unit": "mg/dL",
        "values": [62, 60, 56, 52, 48, 50, 54, 58],
        "low": 40,
        "high": 90,
    },
    {
        "type": "TOTAL_CHOLESTEROL",
        "unit": "mg/dL",
        "values": [178, 182, 195, 205, 212, 198, 188, 180],
        "low": 125,
        "high": 200,
    },
    {
        "type": "TRIGLYCERIDES",
        "unit": "mg/dL",
        "values": [105, 112, 128, 145, 162, 140, 122, 115],
        "low": 0,
        "high": 150,
    },
    {
        "type": "APOB",
        "unit": "mg/dL",
        "values": [78, 82, 88, 95, 102, 92, 85, 80],
        "low": 0,
        "high": 90,
    },
    # Metabolic
    {
        "type": "HEMOGLOBIN_A1C",
        "unit": "%",
        "values": [5.2, 5.3, 5.5, 5.7, 5.8, 5.6, 5.4, 5.3],
        "low": 4.0,
        "high": 5.6,
    },
    {
        "type": "FASTING_GLUCOSE",
        "unit": "mg/dL",
        "values": [86, 88, 94, 102, 108, 98, 92, 88],
        "low": 70,
        "high": 100,
    },
    # Inflammation
    {
        "type": "HSCRP",
        "unit": "mg/L",
        "values": [0.5, 0.6, 0.9, 1.4, 2.1, 1.6, 0.9, 0.6],
        "low": 0,
        "high": 1.0,
    },
    # Hormonal
    {
        "type": "TSH",
        "unit": "uIU/mL",
        "values": [1.8, 2.0, 2.3, 2.8, 3.2, 2.6, 2.2, 1.9],
        "low": 0.5,
        "high": 4.0,
    },
    {
        "type": "FREE_T4",
        "unit": "ng/dL",
        "values": [1.3, 1.2, 1.1, 1.0, 0.9, 1.0, 1.1, 1.2],
        "low": 0.8,
        "high": 1.8,
    },
    {
        "type": "TESTOSTERONE_TOTAL",
        "unit": "ng/dL",
        "values": [580, 560, 520, 480, 450, 490, 530, 560],
        "low": 300,
        "high": 1000,
    },
    # Nutritional
    {
        "type": "VITAMIN_D",
        "unit": "ng/mL",
        "values": [52, 48, 42, 35, 26, 30, 38, 45],
        "low": 30,
        "high": 80,
    },
    {
        "type": "FERRITIN",
        "unit": "ng/mL",
        "values": [95, 90, 82, 72, 65, 70, 80, 88],
        "low": 30,
        "high": 300,
    },
    {
        "type": "VITAMIN_B12",
        "unit": "pg/mL",
        "values": [520, 500, 460, 410, 380, 400, 450, 490],
        "low": 200,
        "high": 900,
    },
]


def determine_status(value: float, low: float, high: float) -> str:
    if low <= value <= high:
        # Inner 60% of optimal range is OPTIMAL, outer edges are NORMAL
        buffer = (high - low) * 0.2
        if (low + buffer) <= value <= (high - buffer):
            return "OPTIMAL"
        return "NORMAL"
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

    # Write biomarker records (8 per type, spaced ~30 days apart → ~7 months)
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
                    "value": Decimal(str(value)),
                    "unit": biomarker["unit"],
                    "referenceRangeLow": Decimal(str(biomarker["low"])),
                    "referenceRangeHigh": Decimal(str(biomarker["high"])),
                    "status": status,
                    "source": "CSV_UPLOAD",
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
