import os
import re
from typing import Any

import boto3
from botocore.exceptions import ClientError


_bucket = os.environ.get("WEBSITE_BUCKET")
_s3 = boto3.client("s3") if _bucket else None
_asset = re.compile(r"/assets/[A-Za-z0-9_.-]+\.(js|css|svg)")
_content_types = {
    "html": "text/html; charset=utf-8",
    "css": "text/css; charset=utf-8",
    "js": "text/javascript; charset=utf-8",
    "svg": "image/svg+xml",
}


def is_site_path(path: str) -> bool:
    return path in {"/", "/auth/callback", "/temple-mark.svg"} or path.startswith("/assets/")


def serve(path: str) -> dict[str, Any]:
    if _s3 is None or (path.startswith("/assets/") and not _asset.fullmatch(path)):
        return {"statusCode": 404, "body": "File not found."}

    key = "index.html" if path in {"/", "/auth/callback"} else path[1:]
    try:
        response = _s3.get_object(Bucket=_bucket, Key=key)
        with response["Body"] as stream:
            content = stream.read().decode("utf-8")
    except ClientError as error:
        if error.response["Error"]["Code"] in {"AccessDenied", "NoSuchKey"}:
            return {"statusCode": 404, "body": "File not found."}
        raise

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": _content_types[key.rsplit(".", 1)[1]],
            "Cache-Control": "public, max-age=31536000, immutable" if key.startswith("assets/") else "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
        "body": content,
    }
