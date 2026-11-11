# API contract

Application API routes other than `GET /health` require a Cognito ID token in `Authorization: <id-token>`. Only a user whose verified `cognito:groups` claim contains `temple-staff` can use `/admin/*` or change schedules. The website and its static files use public GET routes when API Gateway hosts the site.

## Devotee routes

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /events?visitType=DARSHAN&groupSize=2&selectedEventId=...` | Query filters are optional. `visitType` is `DARSHAN` or `AARTI`. | `{ events: Event[], recommendation: Event \| null }` |
| `POST /bookings` | `{ eventId, partySize }` | `{ booking: Booking, created: boolean }`; an identical active reservation is returned on retry. |
| `GET /me/bookings` | No body. | `{ bookings: Booking[] }` for the signed-in account only. |
| `POST /bookings/{bookingId}/cancel` | No body. | `{ booking: Booking }`; eligible places are released atomically. |

`Event` includes the total and online capacity, walk-in quota, remaining walk-in places, and `availableCount` for online reservations. Staff can pass `walkInCapacity` on create or update. Online and walk-in allocations sum to the configured total. `availability` is `AVAILABLE`, `LIMITED`, `FULL`, `CLOSED`, or `CANCELLED`. Recommendations include a `reason`.

`Booking` fields include `bookingId`, `eventId`, `visitType`, `title`, `startsAt`, `endsAt`, `serviceDate`, `partySize`, `status`, `eventStatus`, and a `pass` containing `booking_reference` and `qr_value` while valid.

## Staff routes

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /events` | `eventType`, `title`, `startsAt`, `endsAt`, `serviceDate`, `capacity`, optional `maxGroupSize`, `seriesId`, `description` | `{ event: Event }` |
| `PATCH /events/{eventId}` | Any of `title`, `startsAt`, `endsAt`, `serviceDate`, `capacity`, `maxGroupSize`, `status`, `seriesId`, `description` | `{ event: Event }`; event identity/time cannot change after admissions exist. |
| `GET /admin/dashboard` | No body. | `{ metrics, events }`, calculated from stored records. |
| `GET /admin/bookings?eventId=...&bookingId=...&q=...` | All filters optional. | `{ bookings: Booking[] }` |
| `POST /admin/bookings/{bookingId}/cancel` | No body. | Cancels an eligible booking before the visit starts and records the staff actor. |
| `POST /admin/check-in` | `{ bookingId }` or `{ qrValue }` | `CHECKED_IN` once; a repeat scan returns `ALREADY_CHECKED_IN`. |
| `POST /admin/walk-ins` | `{ eventId, partySize }` | Adds an onsite entry and checks in the group in the same capacity transaction. |

Date-time fields are ISO-8601 values with a time-zone offset. `serviceDate` preserves the local temple date for date-card grouping. For Aarti recommendations, staff must set the same `seriesId` only on actual recurrences of the same ceremony; a one-off ceremony has no `seriesId`.

Errors return `{ error: string }` with an HTTP status. In particular, capacity races and duplicate active reservations return `409` with a plain-language explanation.
