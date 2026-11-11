from typing import Any

from domain.availability import capacity_view


def event_payload(item: dict[str, Any]) -> dict[str, Any]:
    value = capacity_view(item)
    result = {
        "eventId": value.get("event_id"),
        "eventType": value.get("event_type"),
        "title": value.get("title"),
        "startsAt": value.get("starts_at"),
        "endsAt": value.get("ends_at"),
        "serviceDate": value.get("service_date"),
        "capacityTotal": value.get("capacity_total", 0),
        "reservedCount": value.get("reserved_count", 0),
        "walkinCount": value.get("walkin_count", 0),
        "checkedInCount": value.get("checked_in_count", 0),
        "availableCount": value.get("available_count", 0),
        "remainingPlaces": value.get("remaining_places", 0),
        "maxGroupSize": value.get("max_group_size", 0),
        "status": value.get("status", "OPEN"),
        "availability": value.get("availability"),
        "utilizationPercent": value.get("utilization_percent", 0),
    }
    if value.get("series_id"):
        result["seriesId"] = value["series_id"]
    if value.get("description"):
        result["description"] = value["description"]
    return result
