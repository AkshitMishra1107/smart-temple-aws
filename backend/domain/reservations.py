from typing import Any

from data import dynamo


def active_reservation_key(owner_id: str, event_id: str) -> str:
    return f"{owner_id}#{event_id}"


def reserve_transaction(
    event_id: str,
    party_size: int,
    booking: dict[str, Any],
    active_reservation: dict[str, Any],
) -> list[dict[str, Any]]:
    now = booking["created_at"]
    return [
        {
            "Update": {
                "TableName": dynamo.events_table.name,
                "Key": dynamo.serialize_map({"event_id": event_id}),
                "UpdateExpression": "SET reserved_count = reserved_count + :party, available_count = available_count - :party, updated_at = :now",
                "ConditionExpression": "#status = :open AND available_count >= :party AND starts_at > :now",
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": dynamo.serialize_map(
                    {":open": "OPEN", ":party": party_size, ":now": now}
                ),
            }
        },
        {
            "Put": {
                "TableName": dynamo.bookings_table.name,
                "Item": dynamo.serialize_item(booking),
                "ConditionExpression": "attribute_not_exists(booking_id)",
            }
        },
        {
            "Put": {
                "TableName": dynamo.active_bookings_table.name,
                "Item": dynamo.serialize_item(active_reservation),
                "ConditionExpression": "attribute_not_exists(reservation_key)",
            }
        },
    ]


def cancellation_transaction(
    event: dict[str, Any], booking: dict[str, Any], cancelled_at: str
) -> list[dict[str, Any]]:
    party_size = int(booking["party_size"])
    event_update = {
        "TableName": dynamo.events_table.name,
        "Key": dynamo.serialize_map({"event_id": event["event_id"]}),
        "UpdateExpression": "SET reserved_count = reserved_count - :party, updated_at = :now",
        "ConditionExpression": "reserved_count >= :party",
        "ExpressionAttributeValues": dynamo.serialize_map(
            {":party": party_size, ":now": cancelled_at}
        ),
    }
    event_update["UpdateExpression"] += ", available_count = available_count + :party"

    return [
        {"Update": event_update},
        {
            "Update": {
                "TableName": dynamo.bookings_table.name,
                "Key": dynamo.serialize_map({"booking_id": booking["booking_id"]}),
                "UpdateExpression": "SET #status = :cancelled, cancelled_at = :now",
                "ConditionExpression": "#status = :confirmed AND owner_id = :owner",
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": dynamo.serialize_map(
                    {
                        ":cancelled": "CANCELLED",
                        ":confirmed": "CONFIRMED",
                        ":now": cancelled_at,
                        ":owner": booking["owner_id"],
                    }
                ),
            }
        },
        {
            "Delete": {
                "TableName": dynamo.active_bookings_table.name,
                "Key": dynamo.serialize_map(
                    {
                        "reservation_key": active_reservation_key(
                            booking["owner_id"], booking["event_id"]
                        )
                    }
                ),
                "ConditionExpression": "booking_id = :booking",
                "ExpressionAttributeValues": dynamo.serialize_map(
                    {":booking": booking["booking_id"]}
                ),
            }
        },
    ]
