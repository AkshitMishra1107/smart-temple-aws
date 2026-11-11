import base64
import json
from decimal import Decimal
from typing import Any

from auth.permissions import current_user, require_staff
from errors import AppError
from handlers import admin, bookings, checkins, events, website


HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,Idempotency-Key",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
}


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    method = str(event.get("httpMethod", "GET")).upper()
    path = str(event.get("path", "/")).rstrip("/") or "/"

    if path == "/prod" or path.startswith("/prod/"):
        path = path[len("/prod"):] or "/"
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": HEADERS, "body": ""}
    if method == "GET" and path == "/health":
        return _response(200, {"status": "ok", "service": "smart-temple-api"})
    if method == "GET" and website.is_site_path(path):
        return website.serve(path)

    try:
        user = current_user(event)
        payload = _body(event)
        query = event.get("queryStringParameters") or {}
        path_params = event.get("pathParameters") or {}

        if method == "GET" and path == "/events":
            return _response(200, events.list_events(query))
        if method == "POST" and path == "/events":
            require_staff(user)
            return _response(201, {"event": events.create_event(payload, user["user_id"])})
        if method == "PATCH" and path.startswith("/events/"):
            require_staff(user)
            event_id = path_params.get("eventId") or path.rsplit("/", 1)[-1]
            return _response(200, {"event": events.update_event(event_id, payload)})
        if method == "GET" and path == "/me/bookings":
            return _response(200, {"bookings": bookings.list_my_bookings(user["user_id"])})
        if method == "POST" and path == "/bookings":
            created, is_new = bookings.create_booking(user["user_id"], payload)
            return _response(201 if is_new else 200, {"booking": created, "created": is_new})
        if method == "POST" and path.startswith("/bookings/") and path.endswith("/cancel"):
            booking_id = path_params.get("bookingId") or path.split("/")[-2]
            return _response(
                200,
                {"booking": bookings.cancel_booking(user["user_id"], booking_id)},
            )
        if method == "GET" and path == "/admin/dashboard":
            require_staff(user)
            return _response(200, admin.dashboard())
        if method == "GET" and path == "/admin/bookings":
            require_staff(user)
            return _response(200, {"bookings": admin.list_bookings(query)})
        if method == "POST" and path.startswith("/admin/bookings/") and path.endswith("/cancel"):
            require_staff(user)
            booking_id = path_params.get("bookingId") or path.split("/")[-2]
            return _response(200, {"booking": bookings.cancel_booking(user["user_id"], booking_id, staff=True)})
        if method == "POST" and path == "/admin/check-in":
            require_staff(user)
            return _response(200, checkins.check_in(payload, user["user_id"]))
        if method == "POST" and path == "/admin/walk-ins":
            require_staff(user)
            return _response(201, checkins.add_walk_in(payload, user["user_id"]))

        raise AppError(404, "That page or action was not found.")
    except AppError as error:
        return _response(error.status_code, {"error": error.message})
    except (json.JSONDecodeError, UnicodeDecodeError):
        return _response(400, {"error": "The request body must be valid JSON."})
    except Exception as error:  # Keep internal details in CloudWatch, not in API responses.
        print(f"Unhandled request error: {error.__class__.__name__}")
        return _response(500, {"error": "Something went wrong. Try again or contact temple staff."})


def _body(event: dict[str, Any]) -> dict[str, Any]:
    raw = event.get("body")
    if not raw:
        return {}
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise AppError(400, "The request must contain a JSON object.")
    return value


def _response(status_code: int, body: Any) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": HEADERS,
        "body": json.dumps(body, ensure_ascii=False, default=_json_default),
    }


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    raise TypeError(f"Unsupported JSON value: {type(value).__name__}")
