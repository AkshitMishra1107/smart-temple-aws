import os
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeSerializer


_resource = boto3.resource("dynamodb")
_client = _resource.meta.client
_serializer = TypeSerializer()

events_table = _resource.Table(os.environ["EVENTS_TABLE"])
bookings_table = _resource.Table(os.environ["BOOKINGS_TABLE"])
active_bookings_table = _resource.Table(os.environ["ACTIVE_BOOKINGS_TABLE"])
walk_ins_table = _resource.Table(os.environ["WALK_INS_TABLE"])
max_group_size = int(os.environ.get("MAX_GROUP_SIZE", "6"))


def get_event(event_id: str) -> dict[str, Any] | None:
    return events_table.get_item(Key={"event_id": event_id}).get("Item")


def get_booking(booking_id: str) -> dict[str, Any] | None:
    return bookings_table.get_item(Key={"booking_id": booking_id}).get("Item")


def get_active_booking(reservation_key: str) -> dict[str, Any] | None:
    return active_bookings_table.get_item(
        Key={"reservation_key": reservation_key}
    ).get("Item")


def bookings_for_owner(owner_id: str) -> list[dict[str, Any]]:
    response = bookings_table.query(
        IndexName="owner-created-index",
        KeyConditionExpression=Key("owner_id").eq(owner_id),
        ScanIndexForward=False,
    )
    return response.get("Items", [])


def bookings_for_event(event_id: str) -> list[dict[str, Any]]:
    response = bookings_table.query(
        IndexName="event-created-index",
        KeyConditionExpression=Key("event_id").eq(event_id),
        ScanIndexForward=False,
    )
    return response.get("Items", [])


def walk_ins_for_event(event_id: str) -> list[dict[str, Any]]:
    response = walk_ins_table.query(
        IndexName="event-created-index",
        KeyConditionExpression=Key("event_id").eq(event_id),
        ScanIndexForward=False,
    )
    return response.get("Items", [])


def scan_all(table) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    params: dict[str, Any] = {}
    while True:
        response = table.scan(**params)
        items.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            return items
        params["ExclusiveStartKey"] = last_key


def transact_write_items(items: list[dict[str, Any]]) -> None:
    _client.transact_write_items(TransactItems=items)


def serialize_map(values: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        key: _serializer.serialize(value)
        for key, value in values.items()
        if value is not None
    }


def serialize_item(item: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return serialize_map(item)
