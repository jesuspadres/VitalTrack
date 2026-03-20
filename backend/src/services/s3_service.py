"""S3 service wrapper for VitalTrack.

Provides presigned URL generation and object retrieval with consistent
error handling.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import boto3
from botocore.exceptions import ClientError

if TYPE_CHECKING:
    from mypy_boto3_s3.client import S3Client

from middleware.logging_config import get_logger
from shared.exceptions import InternalError, NotFoundError

logger = get_logger("s3-service")


class S3Service:
    """Thin wrapper around the boto3 S3 *client* for a single bucket."""

    def __init__(self, bucket_name: str) -> None:
        self._bucket_name = bucket_name
        self._client: S3Client | None = None

    def _get_client(self) -> S3Client:
        """Return the cached boto3 S3 client."""
        if self._client is None:
            self._client = boto3.client("s3")
        return self._client

    def generate_presigned_url(
        self,
        key: str,
        content_type: str,
        expires_in: int = 900,
    ) -> str:
        """Generate a presigned PUT URL for uploading an object.

        Args:
            key: S3 object key (e.g. ``uploads/{userId}/{filename}``).
            content_type: Expected ``Content-Type`` of the upload.
            expires_in: URL validity in seconds (default 15 minutes).

        Returns:
            The presigned URL string.
        """
        try:
            url: str = self._get_client().generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": self._bucket_name,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in,
            )
            return url
        except ClientError as exc:
            logger.exception(
                "generate_presigned_url failed",
                extra={"bucket": self._bucket_name, "key": key},
            )
            raise InternalError(
                message="Failed to generate upload URL.",
                details=[{"error": str(exc)}],
            ) from exc

    def get_object(self, key: str) -> bytes:
        """Download an object and return its raw bytes.

        Raises ``NotFoundError`` if the key does not exist.
        """
        try:
            response = self._get_client().get_object(
                Bucket=self._bucket_name,
                Key=key,
            )
            return response["Body"].read()  # type: ignore[union-attr]
        except ClientError as exc:
            error_code = exc.response["Error"]["Code"]
            if error_code in ("NoSuchKey", "404"):
                raise NotFoundError(
                    message=f"Object not found: {key}",
                ) from exc
            logger.exception(
                "get_object failed",
                extra={"bucket": self._bucket_name, "key": key},
            )
            raise InternalError(
                message="Failed to retrieve object.",
                details=[{"error": str(exc)}],
            ) from exc
