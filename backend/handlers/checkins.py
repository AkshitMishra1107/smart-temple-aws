from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from botocore.exceptions import ClientError

from data import dynamo
from domain.passes import booking_id_from_qr
from errors import AppError


def check_in(payload: dict[str, Any], staff_id: str) -> dict[str, Any]:
    raw_reference = payload.get("bookingId") or payload.get("qrValue") or ""
    try:
        booking_id = booking_id_from_qr(str(raw_reference))
    except ValueError as error:
        raise AppError(400, str(error)) from error

    booking = dynamo.get_booking(booking_id)
    if not booking:
        raise AppError(404, "No reservation matches that pass.")
    if booking.get("status") == "CHECKED_IN":
        return _already_checked_in(booking)
    if booking.get("status") != "CONFIRMED":
        raise AppError(409, "This pass is cancelled or is no longer valid.")

    event = dynamo.get_event(booking.get("event_id", ""))
    if not event or event.get("status") == "CANCELLED":
        raise AppError(409, "This visit is closed. Do not admit this pass.")
    _check_entry_window(event)

    now = _now()
    party_size = int(booking.get("party_size", 0))
    transactions = [
        {
            "Update": {
                "TableName": dynamo.events_table.name,
                "Key": dynamo.serialize_map({"event_id": event["event_id"]}),
                "UpdateExpression": "SET checked_in_count = checked_in_count + :party, updated_at = :now",
                "ConditionExpression": "#status <> :cancelled",
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": dynamo.serialize_map(
                    {":party": party_size, ":now": now, ":cancelled": "CANCELLED"}
                ),
            }
        },
        {
            "Update": {
                "TableName": dynamo.bookings_table.name,
                "Key": dynamo.serialize_map({"booking_id": booking_id}),
                "UpdateExpression": "SET #status = :checked, checked_in_at = :now, checked_in_by = :staff",
                "ConditionExpression": "#status = :confirmed",
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": dynamo.serialize_map(
                    {
                        ":checked": "CHECKED_IN",
                        ":confirmed": "CONFIRMED",
                        ":now": now,
                        ":staff": staff_id,
                    }
                ),
            }
        },
    ]
    try:
        dynamo.transact_write_items(transactions)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") not in {
            "TransactionCanceledException",
            "ConditionalCheckFailedException",
        }:
            raise
        latest = dynamo.get_booking(booking_id)
        if latest and latest.get("status") == "CHECKED_IN":
            return _already_checked_in(latest)
        raise AppError(409, "This pass changed before check-in. Refresh and try again.") from error

    return {
        "status": "CHECKED_IN",
        "bookingId": booking_id,
        "partySize": party_size,
        "message": f"Checked in {party_size} people.",
    }


def add_walk_in(payload: dict[str, Any], staff_id: str) -> dict[str, Any]:
    event_id = str(payload.get("eventId", "")).strip()
    if not event_id:
        raise AppError(400, "Choose the visit time for this walk-in.")
    party_size = _positive_integer(payload.get("partySize"), "Group size")
    if party_size > dynamo.max_group_size:
        raise AppError(400, f"The largest walk-in group allowed is {dynamo.max_group_size} people.")

    event = dynamo.get_event(event_id)
    if not event:
        raise AppError(404, "That visit time was not found.")
    if event.get("status") != "OPEN":
        raise AppError(409, "This visit time is closed to new admissions.")
    if party_size > int(event.get("max_group_size", dynamo.max_group_size)):
        raise AppError(400, f"This visit allows up to {event.get('max_group_size')} people in one group.")
    _check_entry_window(event)

    now = _now()
    walk_in_id = str(uuid4())
    walk_in = {
        "walkin_id": walk_in_id,
        "event_id": event_id,
        "attendee_count": party_size,
        "created_at": now,
        "created_by": staff_id,
    }
    transactions = [
        {
            "Update": {
                "TableName": dynamo.events_table.name,
                "Key": dynamo.serialize_map({"event_id": event_id}),
                "UpdateExpression": "SET walkin_count = walkin_count + :party, checked_in_count = checked_in_count + :party, available_count = available_count - :party, updated_at = :now",
                "ConditionExpression": "#status = :open AND available_count >= :party",
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": dynamo.serialize_map(
                    {":open": "OPEN", ":party": party_size, ":now": now}
                ),
            }
        },
        {
            "Put": {
                "TableName": dynamo.walk_ins_table.name,
                "Item": dynamo.serialize_map(walk_in),
                "ConditionExpression": "attribute_not_exists(walkin_id)",
            }
        },
    ]
    try:
        dynamo.transact_write_items(transactions)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") not in {
            "TransactionCanceledException",
            "ConditionalCheckFailedException",
        }:
            raise
        latest = dynamo.get_event(event_id)
        remaining = int((latest or {}).get("available_count", 0))
        raise AppError(
            409,
            f"The visit filled before this walk-in could be recorded. {remaining} places remain.",
        ) from error

    return {
        "walkInId": walk_in_id,
        "eventId": event_id,
        "partySize": party_size,
        "status": "CHECKED_IN",
        "message": f"Recorded and checked in {party_size} walk-in people.",
    }


def _check_entry_window(event: dict[str, Any]) -> None:
    start = _parse_time(event.get("starts_at"))
    end = _parse_time(event.get("ends_at"))
    now = datetime.now(timezone.utc)
    if now < start - timedelta(minutes=30):
        raise AppError(409, "Entry opens 30 minutes before this visit.")
    if now > end:
        raise AppError(409, "The entry window for this visit has ended.")


def _already_checked_in(booking: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "ALREADY_CHECKED_IN",
        "bookingId": booking.get("booking_id"),
        "partySize": int(booking.get("party_size", 0)),
        "checkedInAt": booking.get("checked_in_at"),
        "message": "This pass has already been used.",
    }


def _parse_time(value: Any) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError) as error:
        raise AppError(409, "This visit has an invalid date. Contact temple staff.") from error
    if parsed.tzinfo is None:
        raise AppError(409, "This visit has an invalid time zone. Contact temple staff.")
    return parsed.astimezone(timezone.utc)


def _positive_integer(value: Any, label: str) -> int:
    if isinstance(value, bool):
        raise AppError(400, f"{label} must be a whole number greater than zero.")
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise AppError(400, f"{label} must be a whole number greater than zero.")
    if parsed < 1:
        raise AppError(400, f"{label} must be a whole number greater than zero.")
    return parsed


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
