"""Data access layer for DynamoDB operations.

Provides a thin wrapper around the boto3 DynamoDB *resource* API with
consistent error handling, logging, and type hints.
"""

from __future__ import annotations

from typing import Any

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from mypy_boto3_dynamodb.service_resource import DynamoDBServiceResource, Table

from src.middleware.logging_config import get_logger
from src.shared.exceptions import ConflictError, InternalError, NotFoundError

logger = get_logger("dynamodb-service")


class DynamoDBService:
    """High-level helper for a single DynamoDB table."""

    def __init__(self, table_name: str) -> None:
        self._table_name = table_name
        self._table: Table | None = None

    # ------------------------------------------------------------------
    # Table resource (cached per instance)
    # ------------------------------------------------------------------

    def get_table(self) -> Table:
        """Return the cached boto3 ``Table`` resource, creating it on first call."""
        if self._table is None:
            dynamodb: DynamoDBServiceResource = boto3.resource("dynamodb")
            self._table = dynamodb.Table(self._table_name)
        return self._table

    # ------------------------------------------------------------------
    # CRUD operations
    # ------------------------------------------------------------------

    def put_item(self, item: dict[str, Any]) -> None:
        """Write a single item to the table.

        Raises ``InternalError`` on SDK failures.
        """
        try:
            self.get_table().put_item(Item=item)
        except ClientError as exc:
            logger.exception("put_item failed", extra={"table": self._table_name})
            raise InternalError(
                message="Failed to write item.",
                details=[{"error": str(exc)}],
            ) from exc

    def get_item(self, pk: str, sk: str) -> dict[str, Any] | None:
        """Fetch a single item by composite key.

        Returns ``None`` when the item does not exist.  Uses consistent reads
        so that the caller sees the most recent write.
        """
        try:
            response = self.get_table().get_item(
                Key={"userId": pk, "sk": sk},
                ConsistentRead=True,
            )
            return response.get("Item")  # type: ignore[return-value]
        except ClientError as exc:
            logger.exception("get_item failed", extra={"table": self._table_name})
            raise InternalError(
                message="Failed to read item.",
                details=[{"error": str(exc)}],
            ) from exc

    def query_items(
        self,
        pk: str,
        sk_prefix: str,
        limit: int = 50,
        next_token: str | None = None,
        scan_forward: bool = True,
    ) -> tuple[list[dict[str, Any]], str | None]:
        """Query items by partition key and sort-key prefix.

        Returns a tuple of ``(items, next_token)`` where *next_token* is
        ``None`` when there are no more pages.
        """
        key_condition = Key("userId").eq(pk) & Key("sk").begins_with(sk_prefix)
        kwargs: dict[str, Any] = {
            "KeyConditionExpression": key_condition,
            "Limit": limit,
            "ScanIndexForward": scan_forward,
        }
        if next_token is not None:
            # The next_token is the serialised ExclusiveStartKey
            kwargs["ExclusiveStartKey"] = {"userId": pk, "sk": next_token}

        try:
            response = self.get_table().query(**kwargs)
        except ClientError as exc:
            logger.exception("query_items failed", extra={"table": self._table_name})
            raise InternalError(
                message="Failed to query items.",
                details=[{"error": str(exc)}],
            ) from exc

        items: list[dict[str, Any]] = response.get("Items", [])
        last_key = response.get("LastEvaluatedKey")
        out_token: str | None = last_key["sk"] if last_key else None
        return items, out_token

    def update_item(self, pk: str, sk: str, updates: dict[str, Any]) -> dict[str, Any]:
        """Update specific attributes on an existing item.

        Returns the full item after the update.
        Raises ``NotFoundError`` if the item does not exist.
        """
        if not updates:
            raise InternalError(message="No update attributes provided.")

        expression_parts: list[str] = []
        attr_names: dict[str, str] = {}
        attr_values: dict[str, Any] = {}

        for idx, (key, value) in enumerate(updates.items()):
            placeholder_name = f"#attr{idx}"
            placeholder_value = f":val{idx}"
            expression_parts.append(f"{placeholder_name} = {placeholder_value}")
            attr_names[placeholder_name] = key
            attr_values[placeholder_value] = value

        update_expression = "SET " + ", ".join(expression_parts)

        try:
            response = self.get_table().update_item(
                Key={"userId": pk, "sk": sk},
                UpdateExpression=update_expression,
                ExpressionAttributeNames=attr_names,
                ExpressionAttributeValues=attr_values,
                ConditionExpression="attribute_exists(userId)",
                ReturnValues="ALL_NEW",
            )
            return response["Attributes"]  # type: ignore[return-value]
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise NotFoundError(message="Item not found.") from exc
            logger.exception("update_item failed", extra={"table": self._table_name})
            raise InternalError(
                message="Failed to update item.",
                details=[{"error": str(exc)}],
            ) from exc

    def delete_item(self, pk: str, sk: str) -> None:
        """Delete a single item by composite key.

        Raises ``NotFoundError`` if the item does not exist.
        """
        try:
            self.get_table().delete_item(
                Key={"userId": pk, "sk": sk},
                ConditionExpression="attribute_exists(userId)",
            )
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise NotFoundError(message="Item not found.") from exc
            logger.exception("delete_item failed", extra={"table": self._table_name})
            raise InternalError(
                message="Failed to delete item.",
                details=[{"error": str(exc)}],
            ) from exc

    # ------------------------------------------------------------------
    # Batch / transactional writes
    # ------------------------------------------------------------------

    def batch_write_items(self, items: list[dict[str, Any]]) -> None:
        """Write up to 25 items in a single BatchWriteItem call.

        Automatically retries unprocessed items once.
        """
        if not items:
            return

        table = self.get_table()
        try:
            with table.batch_writer() as batch:
                for item in items:
                    batch.put_item(Item=item)
        except ClientError as exc:
            logger.exception("batch_write_items failed", extra={"table": self._table_name})
            raise InternalError(
                message="Batch write failed.",
                details=[{"error": str(exc)}],
            ) from exc

    def transact_write(self, items: list[dict[str, Any]]) -> None:
        """Write multiple items atomically using DynamoDB transactions.

        Each element in *items* is a full item dict to ``Put``.
        """
        if not items:
            return

        dynamodb_client = boto3.client("dynamodb")
        from boto3.dynamodb.types import TypeSerializer

        serializer = TypeSerializer()

        transact_items: list[dict[str, Any]] = []
        for item in items:
            serialized: dict[str, Any] = {
                k: serializer.serialize(v) for k, v in item.items()
            }
            transact_items.append(
                {
                    "Put": {
                        "TableName": self._table_name,
                        "Item": serialized,
                    }
                }
            )

        try:
            dynamodb_client.transact_write_items(TransactItems=transact_items)
        except ClientError as exc:
            error_code = exc.response["Error"]["Code"]
            if error_code == "TransactionCanceledException":
                raise ConflictError(
                    message="Transaction cancelled — one or more conditions failed.",
                    details=[{"error": str(exc)}],
                ) from exc
            logger.exception("transact_write failed", extra={"table": self._table_name})
            raise InternalError(
                message="Transaction write failed.",
                details=[{"error": str(exc)}],
            ) from exc
