"""Clear all biomarker and upload records from the DynamoDB table.

Preserves PROFILE and INSIGHT records. Scans for BIOMARKER# and UPLOAD# sort
keys and batch-deletes them.
"""

import boto3

STAGE = "dev"
REGION = "us-east-1"
TABLE_NAME = f"vitaltrack-biomarkers-{STAGE}"


def main() -> None:
    dynamodb = boto3.resource("dynamodb", region_name=REGION)
    table = dynamodb.Table(TABLE_NAME)

    print(f"Scanning {TABLE_NAME} for BIOMARKER# and UPLOAD# records...")

    deleted = 0
    scan_kwargs: dict = {}
    while True:
        response = table.scan(**scan_kwargs)
        items = response.get("Items", [])

        with table.batch_writer() as batch:
            for item in items:
                sk = item.get("sk", "")
                if sk.startswith("BIOMARKER#") or sk.startswith("UPLOAD#"):
                    batch.delete_item(Key={"userId": item["userId"], "sk": sk})
                    deleted += 1

        if "LastEvaluatedKey" not in response:
            break
        scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    print(f"Deleted {deleted} records.")
    print("Done! Profiles and insights were preserved.")


if __name__ == "__main__":
    main()
