from datetime import datetime, timezone


def parse_instant(value: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Enter a date and time.")
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("Enter a valid date and time.") from error
    if parsed.tzinfo is None:
        raise ValueError("Date and time must include a time zone.")
    return parsed


def utc_string(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def service_date_string(value: str, parsed: datetime) -> str:
    """Use the browser's temple-local date when supplied, otherwise the input offset's date."""
    supplied = value.strip() if isinstance(value, str) else ""
    if supplied:
        try:
            return datetime.strptime(supplied, "%Y-%m-%d").date().isoformat()
        except ValueError as error:
            raise ValueError("Enter a valid service date.") from error
    return parsed.date().isoformat()
