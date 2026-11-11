def make_pass(booking_id: str) -> dict[str, str]:
    """Return an opaque booking reference for QR display and staff lookup."""
    return {
        "booking_reference": booking_id,
        "qr_value": f"smart-temple://booking/{booking_id}",
    }


def booking_id_from_qr(value: str) -> str:
    prefix = "smart-temple://booking/"
    reference = value.strip()
    if reference.startswith(prefix):
        reference = reference[len(prefix):]
    if not reference or len(reference) > 64 or any(char.isspace() for char in reference):
        raise ValueError("Enter a valid booking reference or scan a temple pass.")
    return reference
