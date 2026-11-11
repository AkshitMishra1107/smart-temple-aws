from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from data import dynamo
from domain.availability import capacity_view, recommend_alternative
from domain.serializers import event_payload
from domain.time_utils import parse_instant, service_date_string, utc_string
from errors import AppError


VALID_TYPES = {"DARSHAN", "AARTI"}
VALID_STATUSES = {"OPEN", "CLOSED", "CANCELLED"}


def list_events(query: dict[str, Any]) -> dict[str, Any]:
    visit_type = str(query.get("visitType", "")).upper().strip()
    if visit_type and visit_type not in VALID_TYPES:
        raise AppError(400, "Choose General Darshan or Aarti.")

    group_size = _positive_integer(query.get("groupSize", "1"), "Group size")
    if group_size > dynamo.max_group_size:
        raise AppError(400, f"The largest group allowed is {dynamo.max_group_size} people.")

    now = datetime.now(timezone.utc)
    events = []
    include_cancelled = str(query.get("includeCancelled", "")).lower() in {"true", "1"}
    for item in dynamo.scan_all(dynamo.events_table):
        if visit_type and item.get("event_type") != visit_type:
            continue
        end = _parse_optional_time(item.get("ends_at"))
        if end and end < now:
            continue
        if item.get("status") == "CANCELLED" and not include_cancelled:
            continue
        events.append(capacity_view(item))

    events.sort(key=lambda item: item.get("starts_at", ""))
    selected_event_id = query.get("selectedEventId")
    selected = next(
        (item for item in events if item.get("event_id") == selected_event_id), None
    )
    recommendation = recommend_alternative(selected, events, group_size)
    return {
        "events": [event_payload(item) for item in events],
        "recommendation": event_payload(recommendation) if recommendation else None,
    }


def create_event(payload: dict[str, Any], actor_id: str) -> dict[str, Any]:
    event_type = _required_string(payload.get("eventType"), "Visit type").upper()
    if event_type not in VALID_TYPES:
        raise AppError(400, "Visit type must be General Darshan or Aarti.")
    title = _required_string(payload.get("title"), "Name")
    starts_at, service_date, start_instant = _event_start(payload)
    ends_at, _, end_instant = _event_end(payload)
    if end_instant <= start_instant:
        raise AppError(400, "The end time must be after the start time.")
    if start_instant <= datetime.now(timezone.utc):
        raise AppError(400, "Schedule a future date and time.")

    capacity = _positive_integer(payload.get("capacity"), "Capacity")
    max_group = _positive_integer(
        payload.get("maxGroupSize", dynamo.max_group_size), "Group size limit"
    )
    if max_group > dynamo.max_group_size:
        raise AppError(400, f"The group-size limit cannot exceed {dynamo.max_group_size}.")

    series_id = str(payload.get("seriesId", "")).strip()
    if event_type == "DARSHAN":
        series_id = ""

    now = _now()
    item = {
        "event_id": str(uuid4()),
        "event_type": event_type,
        "title": title,
        "starts_at": starts_at,
        "ends_at": ends_at,
        "service_date": service_date,
        "capacity_total": capacity,
        "reserved_count": 0,
        "walkin_count": 0,
        "checked_in_count": 0,
        "available_count": capacity,
        "max_group_size": max_group,
        "status": "OPEN",
        "created_at": now,
        "updated_at": now,
        "created_by": actor_id,
    }
    if series_id:
        item["series_id"] = series_id
    description = str(payload.get("description", "")).strip()
    if description:
        item["description"] = description[:300]

    dynamo.events_table.put_item(
        Item=item,
        ConditionExpression="attribute_not_exists(event_id)",
    )
    return event_payload(item)


def update_event(event_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    current = dynamo.get_event(event_id)
    if not current:
        raise AppError(404, "That schedule was not found.")
    if not payload:
        raise AppError(400, "Choose a schedule detail to update.")
    if "serviceDate" in payload and "startsAt" not in payload:
        raise AppError(400, "Change the service date together with the start time.")

    used = int(current.get("reserved_count", 0)) + int(current.get("walkin_count", 0))
    protected_fields = {"title", "startsAt", "endsAt", "serviceDate", "seriesId"}
    if used and any(key in payload for key in protected_fields):
        raise AppError(
            409,
            "This visit already has reservations or walk-ins. Close or cancel it before changing its time or identity.",
        )

    changes: dict[str, Any] = {}
    if "title" in payload:
        changes["title"] = _required_string(payload["title"], "Name")
    if "status" in payload:
        status = str(payload["status"]).upper().strip()
        if status not in VALID_STATUSES:
            raise AppError(400, "Choose open, closed, or cancelled.")
        changes["status"] = status
    if "description" in payload:
        changes["description"] = str(payload["description"]).strip()[:300]
    if "maxGroupSize" in payload:
        group_limit = _positive_integer(payload["maxGroupSize"], "Group size limit")
        if group_limit > dynamo.max_group_size:
            raise AppError(400, f"The group-size limit cannot exceed {dynamo.max_group_size}.")
        if group_limit < _largest_active_party(event_id):
            raise AppError(409, "The group-size limit cannot be lower than an existing booking.")
        changes["max_group_size"] = group_limit
    if "capacity" in payload:
        capacity = _positive_integer(payload["capacity"], "Capacity")
        if capacity < used:
            raise AppError(409, "Capacity cannot be lower than the places already reserved or used by walk-ins.")
        changes["capacity_total"] = capacity
        changes["available_count"] = capacity - used

    start_text = payload.get("startsAt")
    end_text = payload.get("endsAt")
    if start_text is not None:
        start, service_date, start_instant = _event_start(payload)
        changes["starts_at"] = start
        changes["service_date"] = service_date
    else:
        start_instant = _parse_optional_time(current.get("starts_at"))
    if end_text is not None:
        end, _, end_instant = _event_end(payload)
        changes["ends_at"] = end
    else:
        end_instant = _parse_optional_time(current.get("ends_at"))
    if start_instant and end_instant and end_instant <= start_instant:
        raise AppError(400, "The end time must be after the start time.")
    if start_text is not None and start_instant and start_instant <= datetime.now(timezone.utc):
        raise AppError(400, "Schedule a future date and time.")
    if "seriesId" in payload:
        series = str(payload["seriesId"]).strip()
        if current.get("event_type") == "AARTI" and series:
            changes["series_id"] = series
        elif current.get("event_type") == "AARTI":
            changes["series_id"] = None

    if not changes:
        raise AppError(400, "Choose a supported schedule detail to update.")

    changes["updated_at"] = _now()
    names: dict[str, str] = {}
    values: dict[str, Any] = {}
    assignments: list[str] = []
    for index, (key, value) in enumerate(changes.items()):
        name_token = f"#field{index}"
        value_token = f":value{index}"
        names[name_token] = key
        if value is None:
            assignments.append(f"REMOVE {name_token}")
        else:
            assignments.append(f"{name_token} = {value_token}")
            values[value_token] = value

    sets = [assignment for assignment in assignments if " = " in assignment]
    removes = [assignment.split(" ", 1)[1] for assignment in assignments if assignment.startswith("REMOVE ")]
    expression_parts = []
    if sets:
        expression_parts.append("SET " + ", ".join(sets))
    if removes:
        expression_parts.append("REMOVE " + ", ".join(removes))
    update_expression = " ".join(expression_parts)

    condition_names = {"#status": "status"}
    condition_values = {
        ":old_status": current.get("status", "OPEN"),
        ":reserved": int(current.get("reserved_count", 0)),
        ":walkins": int(current.get("walkin_count", 0)),
        ":old_capacity": int(current.get("capacity_total", 0)),
    }
    try:
        response = dynamo.events_table.update_item(
            Key={"event_id": event_id},
            UpdateExpression=update_expression,
            ConditionExpression="#status = :old_status AND reserved_count = :reserved AND walkin_count = :walkins AND capacity_total = :old_capacity",
            ExpressionAttributeNames={**names, **condition_names},
            ExpressionAttributeValues={**values, **condition_values},
            ReturnValues="ALL_NEW",
        )
    except Exception as error:
        if error.__class__.__name__ == "ConditionalCheckFailedException":
            raise AppError(409, "The schedule changed while you were editing it. Refresh and try again.") from error
        raise
    return event_payload(response["Attributes"])


def _largest_active_party(event_id: str) -> int:
    return max(
        (int(item.get("party_size", 0)) for item in dynamo.bookings_for_event(event_id) if item.get("status") == "CONFIRMED"),
        default=0,
    )


def _event_start(payload: dict[str, Any]) -> tuple[str, str, datetime]:
    try:
        instant = parse_instant(payload.get("startsAt"))
        service_date = service_date_string(payload.get("serviceDate", ""), instant)
    except ValueError as error:
        raise AppError(400, str(error)) from error
    return utc_string(instant), service_date, instant.astimezone(timezone.utc)


def _event_end(payload: dict[str, Any]) -> tuple[str, str, datetime]:
    try:
        instant = parse_instant(payload.get("endsAt"))
    except ValueError as error:
        raise AppError(400, str(error)) from error
    return utc_string(instant), instant.date().isoformat(), instant.astimezone(timezone.utc)


def _parse_optional_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return parse_instant(str(value)).astimezone(timezone.utc)
    except ValueError:
        return None


def _required_string(value: Any, label: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise AppError(400, f"Enter a {label.lower()}.")
    return text[:120]


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
    return utc_string(datetime.now(timezone.utc))
