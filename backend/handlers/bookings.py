from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from botocore.exceptions import ClientError

from data import dynamo
from domain.availability import capacity_view
from domain.passes import make_pass
from domain.reservations import (
    active_reservation_key,
    cancellation_transaction,
    reserve_transaction,
)
from errors import AppError


def create_booking(owner_id: str, payload: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    event_id = _required_string(payload.get("eventId"), "Choose a visit time")
    party_size = _positive_integer(payload.get("partySize"), "Group size")
    if party_size > dynamo.max_group_size:
        raise AppError(400, f"The largest group allowed is {dynamo.max_group_size} people.")

    event = dynamo.get_event(event_id)
    if not event:
        raise AppError(404, "That visit time is no longer available.")
    reservation_key = active_reservation_key(owner_id, event_id)
    existing = dynamo.get_active_booking(reservation_key)
    if existing:
        prior = dynamo.get_booking(existing.get("booking_id", ""))
        if prior and int(prior.get("party_size", 0)) == party_size:
            return _present_booking(prior, event), False
        raise AppError(409, "You already have a reservation for this visit.")
    if event.get("status") != "OPEN":
        raise AppError(409, "This visit time is closed. Choose another available time.")
    if party_size > int(event.get("max_group_size", dynamo.max_group_size)):
        raise AppError(
            400,
            f"This visit allows up to {event.get('max_group_size', dynamo.max_group_size)} people in one reservation.",
        )
    if _parse_time(event.get("starts_at")) <= datetime.now(timezone.utc):
        raise AppError(409, "Bookings are closed for this visit time.")

    event_view = capacity_view(event)
    if event_view["available_count"] < party_size:
        raise AppError(
            409,
            f"Only {event_view['available_count']} places remain. Choose another time or a smaller group.",
        )

    now = _now()
    booking = {
        "booking_id": str(uuid4()),
        "owner_id": owner_id,
        "event_id": event_id,
        "event_type": event["event_type"],
        "event_title": event["title"],
        "starts_at": event["starts_at"],
        "ends_at": event["ends_at"],
        "service_date": event["service_date"],
        "party_size": party_size,
        "status": "CONFIRMED",
        "created_at": now,
    }
    active_booking = {
        "reservation_key": reservation_key,
        "booking_id": booking["booking_id"],
        "party_size": party_size,
        "created_at": now,
    }

    try:
        dynamo.transact_write_items(
            reserve_transaction(event_id, party_size, booking, active_booking)
        )
        return _present_booking(booking, event), True
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") not in {
            "TransactionCanceledException",
            "ConditionalCheckFailedException",
        }:
            raise

        # A concurrent retry from this devotee should return their successful
        # reservation. Other capacity conflicts receive a fresh count.
        active_now = dynamo.get_active_booking(reservation_key)
        if active_now:
            prior = dynamo.get_booking(active_now.get("booking_id", ""))
            if prior and int(prior.get("party_size", 0)) == party_size:
                return _present_booking(prior, event), False
            raise AppError(409, "You already have a reservation for this visit.") from error

        latest = dynamo.get_event(event_id)
        if not latest or latest.get("status") != "OPEN":
            raise AppError(409, "This visit time just closed. Choose another available time.") from error
        if _parse_time(latest.get("starts_at")) <= datetime.now(timezone.utc):
            raise AppError(409, "Bookings just closed for this visit time. Choose another.") from error
        remaining = int(latest.get("available_count", 0))
        raise AppError(
            409,
            f"Those places were just booked. {remaining} places remain; refresh the schedule and choose again.",
        ) from error


def list_my_bookings(owner_id: str) -> list[dict[str, Any]]:
    result = []
    for booking in dynamo.bookings_for_owner(owner_id):
        event = dynamo.get_event(booking.get("event_id", ""))
        result.append(_present_booking(booking, event))
    return result


def cancel_booking(actor_id: str, booking_id: str, *, staff: bool = False) -> dict[str, Any]:
    booking = dynamo.get_booking(booking_id)
    if not booking:
        raise AppError(404, "That reservation was not found.")
    if not staff and booking.get("owner_id") != actor_id:
        raise AppError(404, "That reservation was not found.")
    if booking.get("status") == "CANCELLED":
        return _present_booking(booking, dynamo.get_event(booking.get("event_id", "")))
    if booking.get("status") != "CONFIRMED":
        raise AppError(409, "This reservation can no longer be cancelled.")

    event = dynamo.get_event(booking.get("event_id", ""))
    if not event:
        raise AppError(409, "The schedule could not be found. Contact temple staff.")
    if _parse_time(booking.get("starts_at")) <= datetime.now(timezone.utc):
        raise AppError(409, "This reservation can no longer be cancelled because its visit has started.")

    try:
        dynamo.transact_write_items(
            cancellation_transaction(event, booking, _now(), actor_id)
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") not in {
            "TransactionCanceledException",
            "ConditionalCheckFailedException",
        }:
            raise
        latest = dynamo.get_booking(booking_id)
        if latest and latest.get("status") == "CANCELLED":
            return _present_booking(latest, event)
        raise AppError(409, "The reservation changed before it could be cancelled. Refresh and try again.") from error

    cancelled = dynamo.get_booking(booking_id) or {**booking, "status": "CANCELLED"}
    return _present_booking(cancelled, event)


def present_booking_for_staff(booking: dict[str, Any], event: dict[str, Any] | None) -> dict[str, Any]:
    result = _present_booking(booking, event)
    result.pop("pass", None)
    return result


def _present_booking(
    booking: dict[str, Any], event: dict[str, Any] | None
) -> dict[str, Any]:
    source = event or {}
    result = {
        "bookingId": booking.get("booking_id"),
        "eventId": booking.get("event_id"),
        "visitType": source.get("event_type", booking.get("event_type")),
        "title": source.get("title", booking.get("event_title", "Temple visit")),
        "startsAt": source.get("starts_at", booking.get("starts_at")),
        "endsAt": source.get("ends_at", booking.get("ends_at")),
        "serviceDate": source.get("service_date", booking.get("service_date")),
        "partySize": int(booking.get("party_size", 1)),
        "status": booking.get("status", "CONFIRMED"),
        "eventStatus": source.get("status", "OPEN"),
        "createdAt": booking.get("created_at"),
        "cancelledAt": booking.get("cancelled_at"),
        "checkedInAt": booking.get("checked_in_at"),
    }
    if result["status"] == "CONFIRMED" and result["endsAt"] and _parse_time(result["endsAt"]) < datetime.now(timezone.utc):
        result["status"] = "UNREDEEMED"
    if result["status"] == "CONFIRMED" and result["eventStatus"] != "CANCELLED":
        result["pass"] = make_pass(str(result["bookingId"]))
    return result


def _required_string(value: Any, message: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise AppError(400, f"{message}.")
    return text


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


def _parse_time(value: Any) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError) as error:
        raise AppError(409, "This visit has an invalid date. Contact temple staff.") from error
    if parsed.tzinfo is None:
        raise AppError(409, "This visit has an invalid time zone. Contact temple staff.")
    return parsed.astimezone(timezone.utc)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
