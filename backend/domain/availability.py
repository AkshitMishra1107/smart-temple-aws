from datetime import datetime, timezone
from typing import Any


def capacity_view(event: dict[str, Any]) -> dict[str, Any]:
    capacity = int(event.get("capacity_total", 0))
    reserved = int(event.get("reserved_count", 0))
    walk_ins = int(event.get("walkin_count", 0))
    walkin_capacity = int(event.get("walkin_capacity", walk_ins))
    online_capacity = capacity - walkin_capacity
    remaining = max(0, int(event.get("available_count", capacity - reserved - walk_ins)))
    status = event.get("status", "OPEN")

    if status == "CANCELLED":
        availability = "CANCELLED"
    elif status != "OPEN":
        availability = "CLOSED"
    elif remaining == 0:
        availability = "FULL"
    elif remaining <= max(5, int(online_capacity * 0.1)):
        availability = "LIMITED"
    else:
        availability = "AVAILABLE"

    result = dict(event)
    result.update(
        {
            "capacity_total": capacity,
            "reserved_count": reserved,
            "walkin_count": walk_ins,
            "walkin_capacity": walkin_capacity,
            "walkin_available_count": max(0, walkin_capacity - walk_ins),
            "online_capacity": online_capacity,
            "checked_in_count": int(event.get("checked_in_count", 0)),
            "available_count": remaining,
            "remaining_places": remaining,
            "availability": availability,
            "utilization_percent": round(
                (reserved / online_capacity) * 100, 1
            ) if online_capacity else 0.0,
        }
    )
    return result


def recommend_alternative(
    selected_event: dict[str, Any] | None,
    events: list[dict[str, Any]],
    group_size: int,
) -> dict[str, Any] | None:
    if not selected_event:
        return None

    selected = capacity_view(selected_event)
    selected_start = _parse_time(selected.get("starts_at"))
    now = datetime.now(timezone.utc)
    selected_can_fit = (
        selected.get("status") == "OPEN"
        and selected.get("available_count", 0) >= group_size
        and selected.get("max_group_size", 1) >= group_size
        and selected_start is not None
        and selected_start > now
    )
    if selected.get("event_type") == "AARTI" and selected_can_fit:
        return None
    candidates: list[dict[str, Any]] = []

    for raw in events:
        candidate = capacity_view(raw)
        if candidate.get("event_id") == selected.get("event_id"):
            continue
        if candidate.get("status") != "OPEN":
            continue
        if candidate.get("available_count", 0) < group_size:
            continue
        if int(candidate.get("max_group_size", 1)) < group_size:
            continue
        start = _parse_time(candidate.get("starts_at"))
        if not start or start <= now:
            continue

        if selected.get("event_type") == "AARTI":
            # Only recurring instances explicitly linked by temple staff count
            # as the same ceremony. One-off rituals have no series_id.
            if not selected.get("series_id") or candidate.get("series_id") != selected.get("series_id"):
                continue
            if candidate.get("event_type") != "AARTI":
                continue
            if selected_start and (start <= selected_start or start.time() != selected_start.time()):
                continue
        else:
            if candidate.get("event_type") != "DARSHAN":
                continue

        candidate["_start"] = start
        candidates.append(candidate)

    if not candidates:
        return None

    if selected.get("event_type") == "AARTI":
        candidates.sort(key=lambda item: item["_start"])
        reason = "The next scheduled occurrence of this Aarti has enough places."
    else:
        same_day = [
            item for item in candidates
            if item.get("service_date") == selected.get("service_date")
        ]
        if selected_can_fit:
            candidates = [
                item for item in candidates
                if item["available_count"] > selected["available_count"]
            ]
            if not candidates:
                return None
            same_day = [item for item in same_day if item in candidates]
        pool = same_day or candidates
        selected_start = selected_start or now
        pool.sort(
            key=lambda item: (
                abs((item["_start"] - selected_start).total_seconds()),
                -item["available_count"],
            )
        )
        candidates = pool
        if not selected_can_fit:
            reason = "This Darshan window cannot fit your group; this one has room."
        else:
            reason = "This Darshan window has more places available."

    recommendation = {key: value for key, value in candidates[0].items() if not key.startswith("_")}
    recommendation["reason"] = reason
    return recommendation


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
