import os
from typing import Any

from errors import AppError


def current_user(event: dict[str, Any]) -> dict[str, Any]:
    request_context = event.get("requestContext") or {}
    authorizer = request_context.get("authorizer") or {}
    claims = authorizer.get("claims") or {}

    # API Gateway REST Cognito authorizers expose the verified claims here.
    user_id = claims.get("sub")
    if not user_id:
        raise AppError(401, "Sign in to continue.")

    groups: Any = claims.get("cognito:groups", [])
    if isinstance(groups, str):
        groups = [part.strip() for part in groups.strip("[]").replace('"', "").split(",") if part.strip()]
    if not isinstance(groups, list):
        groups = []

    return {
        "user_id": user_id,
        "email": claims.get("email", ""),
        "groups": groups,
        "staff_group": os.environ.get("STAFF_GROUP", "temple-staff"),
    }


def require_staff(user: dict[str, Any]) -> None:
    if user.get("staff_group") not in user.get("groups", []):
        raise AppError(403, "This action is only available to temple staff.")
