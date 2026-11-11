# Interface direction

## Design tokens

- **Deep river ink — `#17343B`:** primary navigation, headings, and strong text.
- **Mist paper — `#F5F7F4`:** page canvas, cool and calm rather than ceremonial decoration.
- **Pale stone — `#E4EAE5`:** panels, card outlines, and quiet separators.
- **Marigold — `#C99736`:** the single memorable accent for primary actions and selected availability.
- **River green — `#416E68`:** confirmed and open states, always paired with words.
- **Brick — `#9A4D42`:** errors and closed states, always paired with words.

## Type

Use a readable system sans stack for body text and controls (`Aptos`, `Segoe UI`, system sans-serif). Use `Palatino Linotype`, `Book Antiqua`, or Georgia for the main visitor heading only. Keep the booking details and staff figures in the sans family for quick scanning; no external font download is required.

## Layout

Devotee booking is left-aligned and centered within a modest reading width. The primary task is always visit type → date/time → group size → review. Event cards show ceremony name, date/time, places left, and an explicit status.

```text
DESKTOP VISITOR
┌ Temple name ───────────────────────── Sign in ┐
│ Reserve a visit                                │
│ [ General Darshan ] [ Aarti ]                  │
│ Dates and time windows       Booking summary   │
│ [date / places / status]     Party size        │
│ [date / places / status]     [Review booking]  │
└────────────────────────────────────────────────┘

DESKTOP STAFF
┌ Temple name ───────────────────────── Staff ┐
│ Overview │ Schedule │ Reservations │ Entry  │
│ Expected people │ Checked in │ Places left │
│ Upcoming schedules and current reservation list │
│ Search / filter / event controls                 │
└──────────────────────────────────────────────────┘
```

On narrow screens, use one column, keep date choices full-width, and place the booking summary after the selected slot. Staff tables become labeled stacked rows rather than shrinking into unreadable columns.

## Principles

- Make remaining places and full status legible without color alone.
- Keep one clear primary action per step; recommendations explain why they fit.
- Use the marigold accent only where the visitor must make a decision.
- Avoid stock temple imagery, gradient washes, animation, and decorative religious iconography; the product is an operational tool, not a campaign page.
- Empty and error states explain what the person can do next.
