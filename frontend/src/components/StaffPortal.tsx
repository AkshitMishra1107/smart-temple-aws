import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { addWalkIn, checkIn, createEvent, getDashboard, searchBookings, updateEvent, type Booking, type DashboardData, type EventStatus, type TempleEvent, type VisitType } from '../lib/api'

interface EventForm {
  eventType: VisitType
  title: string
  startsAt: string
  endsAt: string
  capacity: string
  maxGroupSize: string
  seriesId: string
  description: string
}

const blankEvent: EventForm = {
  eventType: 'DARSHAN',
  title: '',
  startsAt: '',
  endsAt: '',
  capacity: '120',
  maxGroupSize: '6',
  seriesId: '',
  description: '',
}

export default function StaffPortal() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [eventForm, setEventForm] = useState<EventForm>(blankEvent)
  const [capacityInputs, setCapacityInputs] = useState<Record<string, string>>({})
  const [eventFilter, setEventFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [walkInEvent, setWalkInEvent] = useState('')
  const [walkInSize, setWalkInSize] = useState(1)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    getDashboard()
      .then((data) => {
        if (active) setDashboard(data)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'The staff dashboard could not be loaded.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refreshVersion])

  useEffect(() => {
    let active = true
    searchBookings(appliedSearch, eventFilter || undefined)
      .then((items) => { if (active) setBookings(items) })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Reservations could not be loaded.')
      })
    return () => { active = false }
  }, [appliedSearch, eventFilter, refreshVersion])

  const events = dashboard?.events || []
  const openEvents = events.filter((event) => event.status === 'OPEN')

  async function refresh() {
    setRefreshVersion((value) => value + 1)
  }

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setError('')
    setMessage('')
    try {
      const start = indiaDateTime(eventForm.startsAt)
      const end = indiaDateTime(eventForm.endsAt)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error('Enter both a start time and an end time.')
      }
      if (end <= start) throw new Error('The end time must be after the start time.')
      await createEvent({
        eventType: eventForm.eventType,
        title: eventForm.title.trim(),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        serviceDate: eventForm.startsAt.slice(0, 10),
        capacity: Number(eventForm.capacity),
        maxGroupSize: Number(eventForm.maxGroupSize),
        seriesId: eventForm.seriesId.trim(),
        description: eventForm.description.trim(),
      })
      setEventForm(blankEvent)
      setMessage('The visit time is on the schedule.')
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The visit time could not be added.')
    } finally {
      setCreating(false)
    }
  }

  async function handleUpdate(event: TempleEvent, changes: Record<string, unknown>, action: string) {
    setError('')
    setMessage('')
    try {
      await updateEvent(event.eventId, changes)
      setMessage(action)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The schedule could not be updated.')
    }
  }

  async function handleWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!walkInEvent) return
    setError('')
    setMessage('')
    try {
      const result = await addWalkIn(walkInEvent, walkInSize)
      setMessage(result.message)
      setWalkInSize(1)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The walk-in could not be recorded.')
    }
  }

  const handleCheckIn = useCallback(async (reference: string) => {
    setError('')
    setMessage('')
    try {
      const result = await checkIn(reference)
      setMessage(result.message)
      setRefreshVersion((value) => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The pass could not be checked in.')
    }
  }, [])

  return (
    <section className="staff-page" aria-labelledby="staff-heading">
      <div className="page-intro compact-intro staff-intro">
        <div><p className="eyebrow">Temple operations</p><h1 id="staff-heading">Staff desk</h1><p className="intro-copy">Manage upcoming visits and check arrivals against the schedule.</p></div>
        <button className="button button-outline" type="button" onClick={() => void refresh()} disabled={loading}>Refresh numbers</button>
      </div>

      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {message && <p className="notice notice-success" role="status">{message}</p>}

      <section className="metrics-grid" aria-label="Upcoming visit totals" aria-busy={loading}>
        <Metric label="Reservations" value={dashboard?.metrics.reservations ?? 0} note="Confirmed groups" />
        <Metric label="Expected people" value={dashboard?.metrics.expectedPeople ?? 0} note="Reservations and walk-ins" />
        <Metric label="Checked in" value={dashboard?.metrics.checkedInPeople ?? 0} note="People admitted so far" />
        <Metric label="Places remaining" value={dashboard?.metrics.placesRemaining ?? 0} note="Open schedules only" />
      </section>

      <section className="staff-section schedule-management" aria-labelledby="schedule-management-heading">
        <div className="staff-section-heading">
          <div><p className="eyebrow">Capacity and timing</p><h2 id="schedule-management-heading">Upcoming schedule</h2></div>
          <span className="utilization-note">Capacity used: {dashboard?.metrics.capacityUtilizationPercent ?? 0}%</span>
        </div>
        {loading && <p className="loading-copy" aria-live="polite">Loading current visit totals…</p>}
        {!loading && events.length === 0 && <p className="inline-empty">No visit times have been added.</p>}
        <div className="staff-event-list">
          {events.map((event) => (
            <StaffEventRow
              key={event.eventId}
              event={event}
              currentCapacity={capacityInputs[event.eventId] ?? String(event.capacityTotal)}
              onCapacityChange={(value) => setCapacityInputs((values) => ({ ...values, [event.eventId]: value }))}
              onSaveCapacity={() => void handleUpdate(event, { capacity: Number(capacityInputs[event.eventId] ?? event.capacityTotal) }, 'Capacity updated.')}
              onStatusChange={(status, label) => void handleUpdate(event, { status }, label)}
            />
          ))}
        </div>
      </section>

      <div className="staff-work-grid">
        <section className="staff-section create-event-section" aria-labelledby="add-event-heading">
          <div className="staff-section-heading"><div><p className="eyebrow">Prepare ahead</p><h2 id="add-event-heading">Add a visit time</h2></div></div>
          <form className="event-form" onSubmit={handleCreateEvent}>
            <label className="form-field">
              <span>Visit type</span>
              <select value={eventForm.eventType} onChange={(event) => setEventForm((value) => ({ ...value, eventType: event.target.value as VisitType, title: '' }))}>
                <option value="DARSHAN">General Darshan</option>
                <option value="AARTI">Aarti ceremony</option>
              </select>
            </label>
            <label className="form-field form-field-full">
              <span>{eventForm.eventType === 'AARTI' ? 'Ceremony name' : 'Visit window name'}</span>
              <input required maxLength={120} value={eventForm.title} onChange={(event) => setEventForm((value) => ({ ...value, title: event.target.value }))} placeholder={eventForm.eventType === 'AARTI' ? 'Evening Aarti' : 'Morning Darshan'} />
            </label>
            <label className="form-field">
              <span>Starts</span>
              <input type="datetime-local" required value={eventForm.startsAt} onChange={(event) => setEventForm((value) => ({ ...value, startsAt: event.target.value }))} />
              <small>Enter the temple’s local time in India Standard Time (IST).</small>
            </label>
            <label className="form-field">
              <span>Ends</span>
              <input type="datetime-local" required value={eventForm.endsAt} onChange={(event) => setEventForm((value) => ({ ...value, endsAt: event.target.value }))} />
            </label>
            <label className="form-field">
              <span>Total places</span>
              <input type="number" min="1" max="100000" required value={eventForm.capacity} onChange={(event) => setEventForm((value) => ({ ...value, capacity: event.target.value }))} />
            </label>
            <label className="form-field">
              <span>Max people per group</span>
              <select value={eventForm.maxGroupSize} onChange={(event) => setEventForm((value) => ({ ...value, maxGroupSize: event.target.value }))}>
                {[1, 2, 3, 4, 5, 6].map((size) => <option value={size} key={size}>{size} {size === 1 ? 'person' : 'people'}</option>)}
              </select>
            </label>
            {eventForm.eventType === 'AARTI' && (
              <label className="form-field form-field-full">
                <span>Recurring ceremony ID <small>Optional</small></span>
                <input maxLength={80} value={eventForm.seriesId} onChange={(event) => setEventForm((value) => ({ ...value, seriesId: event.target.value }))} placeholder="For example, evening-aarti" />
                <small>Use the same ID only for real occurrences of this same Aarti. Leave blank for a one-time ceremony.</small>
              </label>
            )}
            <label className="form-field form-field-full">
              <span>Visitor note <small>Optional</small></span>
              <textarea maxLength={300} rows={2} value={eventForm.description} onChange={(event) => setEventForm((value) => ({ ...value, description: event.target.value }))} placeholder="Short entry instructions for visitors" />
            </label>
            <button className="button button-primary" type="submit" disabled={creating}>{creating ? 'Adding…' : 'Add to schedule'}</button>
          </form>
        </section>

        <div className="staff-side-column">
          <section className="staff-section check-in-section" aria-labelledby="check-in-heading">
            <div className="staff-section-heading"><div><p className="eyebrow">At the entrance</p><h2 id="check-in-heading">Check a pass</h2></div></div>
            <CheckInPanel onCheckIn={handleCheckIn} />
          </section>

          <section className="staff-section walk-in-section" aria-labelledby="walk-in-heading">
            <div className="staff-section-heading"><div><p className="eyebrow">On-site admission</p><h2 id="walk-in-heading">Record a walk-in</h2></div></div>
            <form className="walk-in-form" onSubmit={handleWalkIn}>
              <label className="form-field">
                <span>Visit time</span>
                <select required value={walkInEvent} onChange={(event) => setWalkInEvent(event.target.value)}>
                  <option value="">Choose an open visit</option>
                  {openEvents.map((event) => <option key={event.eventId} value={event.eventId}>{event.title} · {formatDate(event.serviceDate)} {formatTime(event.startsAt)}</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>People arriving</span>
                <select value={walkInSize} onChange={(event) => setWalkInSize(Number(event.target.value))}>
                  {[1, 2, 3, 4, 5, 6].map((size) => <option key={size} value={size}>{size} {size === 1 ? 'person' : 'people'}</option>)}
                </select>
              </label>
              <button className="button button-outline button-wide" type="submit" disabled={!walkInEvent}>Record admission</button>
            </form>
          </section>
        </div>
      </div>

      <section className="staff-section reservations-section" aria-labelledby="reservations-heading">
        <div className="staff-section-heading reservations-heading-row">
          <div><p className="eyebrow">Visitor list</p><h2 id="reservations-heading">Reservations</h2></div>
          <form className="booking-search" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(searchInput.trim()) }}>
            <label className="visually-hidden" htmlFor="booking-search-input">Search by booking reference</label>
            <input id="booking-search-input" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search booking reference" />
            <button className="button button-outline" type="submit">Search</button>
          </form>
        </div>
        <label className="event-filter">
          <span>Filter by visit</span>
          <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}>
            <option value="">All upcoming visits</option>
            {events.map((event) => <option value={event.eventId} key={event.eventId}>{event.title} · {formatDate(event.serviceDate)}</option>)}
          </select>
        </label>
        <BookingTable bookings={bookings} />
      </section>
    </section>
  )
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return <article className="metric"><span className="metric-label">{label}</span><strong>{value.toLocaleString('en-IN')}</strong><span className="metric-note">{note}</span></article>
}

function StaffEventRow({ event, currentCapacity, onCapacityChange, onSaveCapacity, onStatusChange }: {
  event: TempleEvent
  currentCapacity: string
  onCapacityChange: (value: string) => void
  onSaveCapacity: () => void
  onStatusChange: (status: EventStatus, label: string) => void
}) {
  const nextStatus: EventStatus | null = event.status === 'OPEN' ? 'CLOSED' : event.status === 'CLOSED' ? 'OPEN' : null
  return (
    <article className="staff-event-row">
      <div className="staff-event-details">
        <div className="staff-event-title"><strong>{event.title}</strong><span className={`status-badge status-${event.availability.toLowerCase()}`}>{event.status === 'OPEN' ? 'Open for bookings' : event.status === 'CLOSED' ? 'Bookings closed' : 'Cancelled'}</span></div>
        <span>{event.eventType === 'AARTI' ? 'Aarti' : 'General Darshan'} · {formatDate(event.serviceDate)} · {formatTime(event.startsAt)}</span>
        <span>{event.reservedCount} reserved · {event.walkinCount} walk-in · {event.checkedInCount} checked in · {event.availableCount} places left</span>
      </div>
      <div className="staff-event-actions">
        <label className="capacity-edit">
          <span>Capacity</span>
          <input aria-label={`Total capacity for ${event.title}`} type="number" min="1" max="100000" value={currentCapacity} onChange={(change) => onCapacityChange(change.target.value)} />
        </label>
        <button className="button button-small button-outline" type="button" onClick={onSaveCapacity}>Save capacity</button>
        {nextStatus && <button className="text-action" type="button" onClick={() => onStatusChange(nextStatus, nextStatus === 'OPEN' ? 'Bookings reopened.' : 'Bookings closed for this visit.')}>{nextStatus === 'OPEN' ? 'Reopen' : 'Close bookings'}</button>}
        {event.status !== 'CANCELLED' && <button className="text-action text-danger" type="button" onClick={() => { if (window.confirm(`Cancel ${event.title}? Existing passes will no longer be valid.`)) onStatusChange('CANCELLED', 'Visit cancelled.') }}>Cancel visit</button>}
      </div>
    </article>
  )
}

function CheckInPanel({ onCheckIn }: { onCheckIn: (reference: string) => Promise<void> }) {
  const [reference, setReference] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanError, setScanError] = useState('')
  const busy = useRef(false)

  useEffect(() => {
    if (!scannerOpen) return
    let reader: import('html5-qrcode').Html5Qrcode | null = null
    let disposed = false

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (disposed) return
        reader = new Html5Qrcode('temple-qr-reader')
        await reader.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1 },
          async (decodedText) => {
            if (disposed || busy.current) return
            busy.current = true
            setReference(decodedText)
            setScannerOpen(false)
            await onCheckIn(decodedText)
            busy.current = false
          },
          () => undefined,
        )
      } catch (reason) {
        if (!disposed) {
          setScanError(reason instanceof Error ? reason.message : 'Camera access is not available. Enter the booking reference instead.')
          setScannerOpen(false)
        }
      }
    }

    void startScanner()
    return () => {
      disposed = true
      if (reader) {
        void reader.stop().then(() => reader?.clear()).catch(() => undefined)
      }
    }
  }, [scannerOpen, onCheckIn])

  async function submitReference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reference.trim()) return
    setScanError('')
    await onCheckIn(reference.trim())
  }

  return (
    <div className="check-in-tools">
      <p className="form-hint">Scan the QR pass or enter its booking reference. A pass can be checked in once.</p>
      {scannerOpen && <div id="temple-qr-reader" className="qr-reader" aria-label="Camera view for scanning a QR pass" />}
      {scanError && <p className="notice notice-error" role="alert">{scanError}</p>}
      <button className="button button-outline button-wide" type="button" onClick={() => { setScanError(''); setScannerOpen((value) => !value) }}>
        {scannerOpen ? 'Close camera' : 'Open camera to scan'}
      </button>
      <form className="check-in-form" onSubmit={submitReference}>
        <label className="form-field" htmlFor="booking-reference"><span>Booking reference</span></label>
        <input id="booking-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Paste or type the reference" autoComplete="off" />
        <button className="button button-primary button-wide" type="submit" disabled={!reference.trim()}>Check in</button>
      </form>
    </div>
  )
}

function BookingTable({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) return <p className="inline-empty">No reservations match this view.</p>
  return (
    <div className="table-scroll">
      <table className="booking-table">
        <thead><tr><th scope="col">Reference</th><th scope="col">Visit</th><th scope="col">Date and time</th><th scope="col">People</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {bookings.map((booking) => (
            <tr key={booking.bookingId}>
              <td><code>{booking.bookingId.slice(0, 8)}</code></td>
              <td>{booking.title}</td>
              <td>{formatDate(booking.serviceDate)} · {formatTime(booking.startsAt)}</td>
              <td>{booking.partySize}</td>
              <td><span className={`status-badge booking-status-${booking.status.toLowerCase()}`}>{booking.status === 'CHECKED_IN' ? 'Checked in' : booking.status === 'CANCELLED' ? 'Cancelled' : 'Confirmed'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value || '1970-01-01'}T12:00:00Z`))
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(value))
}

function indiaDateTime(value: string): Date {
  return new Date(`${value}:00+05:30`)
}
