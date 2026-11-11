from datetime import datetime, timezone
from typing import Any

from data import dynamo
from domain.availability import capacity_view
from domain.serializers import event_payload


def dashboard() -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    upcoming = []
    for event in dynamo.scan_all(dynamo.events_table):
        end = _parse_time(event.get("ends_at"))
        if end and end < now:
            continue
        upcoming.append(capacity_view(event))
    upcoming.sort(key=lambda event: event.get("starts_at", ""))

    counted = [event for event in upcoming if event.get("status") != "CANCELLED"]
    active_event_ids = {event.get("event_id") for event in counted}
    active_reservations = [
        booking for booking in dynamo.scan_all(dynamo.bookings_table)
        if booking.get("event_id") in active_event_ids
        and booking.get("status") in {"CONFIRMED", "CHECKED_IN"}
    ]
    total_capacity = sum(int(event.get("capacity_total", 0)) for event in counted)
    total_used = sum(
        int(event.get("reserved_count", 0)) + int(event.get("walkin_count", 0))
        for event in counted
    )
    return {
        "metrics": {
            "reservations": len(active_reservations),
            "expectedPeople": total_used,
            "checkedInPeople": sum(int(event.get("checked_in_count", 0)) for event in counted),
            "placesRemaining": sum(
                int(event.get("available_count", 0))
                for event in counted if event.get("status") == "OPEN"
            ),
            "capacityUtilizationPercent": round((total_used / total_capacity) * 100, 1)
            if total_capacity else 0.0,
        },
        "events": [event_payload(event) for event in upcoming],
    }


def list_bookings(query: dict[str, Any]) -> list[dict[str, Any]]:
    booking_id = str(query.get("bookingId", "")).strip()
    event_id = str(query.get("eventId", "")).strip()
    search = str(query.get("q", "")).strip().casefold()

    if booking_id:
        booking = dynamo.get_booking(booking_id)
        bookings = [booking] if booking else []
    elif event_id:
        bookings = dynamo.bookings_for_event(event_id)
    else:
        bookings = dynamo.scan_all(dynamo.bookings_table)
        bookings.sort(key=lambda item: item.get("created_at", ""), reverse=True)

    result = []
    for booking in bookings:
        if not booking:
            continue
        if search and search not in str(booking.get("booking_id", "")).casefold():
            continue
        event = dynamo.get_event(booking.get("event_id", ""))
        result.append(
            {
                "bookingId": booking.get("booking_id"),
                "eventId": booking.get("event_id"),
                "visitType": event.get("event_type") if event else booking.get("event_type"),
                "title": event.get("title") if event else booking.get("event_title"),
                "startsAt": event.get("starts_at") if event else booking.get("starts_at"),
                "serviceDate": event.get("service_date") if event else booking.get("service_date"),
                "partySize": int(booking.get("party_size", 0)),
                "status": booking.get("status"),
                "createdAt": booking.get("created_at"),
                "checkedInAt": booking.get("checked_in_at"),
            }
        )
    result.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    return result[:100]


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)
