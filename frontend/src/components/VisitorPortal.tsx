import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { cancelBooking, createBooking, getEvents, getMyBookings, type Booking, type TempleEvent, type VisitType } from '../lib/api'

interface VisitorPortalProps {
  historyOnly?: boolean
}

export default function VisitorPortal({ historyOnly = false }: VisitorPortalProps) {
  return historyOnly ? <BookingHistory /> : <BookingFlow />
}

function BookingFlow() {
  const [visitType, setVisitType] = useState<VisitType>('DARSHAN')
  const [groupSize, setGroupSize] = useState(1)
  const [selectedEventId, setSelectedEventId] = useState('')
  const [events, setEvents] = useState<TempleEvent[]>([])
  const [recommendation, setRecommendation] = useState<(TempleEvent & { reason: string }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [bookingBusy, setBookingBusy] = useState(false)
  const [error, setError] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    getEvents(visitType, groupSize, selectedEventId || undefined)
      .then((data) => {
        if (!active) return
        setEvents(data.events)
        setRecommendation(data.recommendation)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'The schedule could not be loaded.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [visitType, groupSize, selectedEventId, refreshVersion])

  const selected = events.find((event) => event.eventId === selectedEventId) || null
  const canReserve = Boolean(
    selected
    && selected.status === 'OPEN'
    && selected.availableCount >= groupSize
    && selected.maxGroupSize >= groupSize,
  )

  async function handleBooking() {
    if (!selected || !canReserve) return
    setBookingBusy(true)
    setError('')
    try {
      const response = await createBooking(selected.eventId, groupSize)
      setBooking(response.booking)
      setRefreshVersion((value) => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The reservation could not be completed.')
      setRefreshVersion((value) => value + 1)
    } finally {
      setBookingBusy(false)
    }
  }

  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow">Plan your visit</p>
          <h1>Choose a time that works for you.</h1>
          <p className="intro-copy">See current availability before you travel. Your reservation is confirmed only after you choose a visit and group size.</p>
        </div>
        <div className="intro-note">
          <span className="note-mark" aria-hidden="true">i</span>
          <p>Reservations help staff plan arrivals. Temple staff guide entry and queues on site.</p>
        </div>
      </section>

      <div className="booking-layout">
        <section className="schedule-column" aria-labelledby="schedule-heading">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Choose your visit</p>
              <h2 id="schedule-heading">Darshan or Aarti</h2>
            </div>
            <label className="party-select">
              <span>People in your group</span>
              <select value={groupSize} onChange={(event) => { setGroupSize(Number(event.target.value)); setBooking(null) }}>
                {Array.from({ length: 6 }, (_, index) => index + 1).map((size) => (
                  <option key={size} value={size}>{size} {size === 1 ? 'person' : 'people'}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="visit-switch" role="group" aria-label="Visit type">
            <button type="button" className={visitType === 'DARSHAN' ? 'switch-option selected' : 'switch-option'} aria-pressed={visitType === 'DARSHAN'} onClick={() => { setVisitType('DARSHAN'); setSelectedEventId(''); setBooking(null) }}>
              <span className="switch-icon" aria-hidden="true"><DarshanGlyph /></span>
              <span><strong>General Darshan</strong><small>Flexible visit times</small></span>
            </button>
            <button type="button" className={visitType === 'AARTI' ? 'switch-option selected' : 'switch-option'} aria-pressed={visitType === 'AARTI'} onClick={() => { setVisitType('AARTI'); setSelectedEventId(''); setBooking(null) }}>
              <span className="switch-icon" aria-hidden="true"><AartiGlyph /></span>
              <span><strong>Attend an Aarti</strong><small>Choose a named ceremony</small></span>
            </button>
          </div>

          {recommendation && (
            <section className="recommendation" aria-labelledby="recommendation-heading" aria-live="polite">
              <div className="recommendation-copy">
                <span className="recommendation-kicker">Suggested option</span>
                <h3 id="recommendation-heading">{recommendation.title}</h3>
                <p>{recommendation.reason}</p>
                <p className="recommendation-time">{formatDate(recommendation.serviceDate)} · {formatTime(recommendation.startsAt)}</p>
              </div>
              <button className="button button-outline" type="button" onClick={() => setSelectedEventId(recommendation.eventId)}>
                Choose this time
              </button>
            </section>
          )}

          {error && <p className="notice notice-error" role="alert">{error}</p>}
          <div className="schedule-list" aria-live="polite" aria-busy={loading}>
            {loading && <p className="loading-copy">Loading the latest schedule…</p>}
            {!loading && events.length === 0 && !error && (
              <div className="empty-state">
                <div className="empty-mark" aria-hidden="true"><CalendarGlyph /></div>
                <h3>No visit times posted yet</h3>
                <p>Temple staff will add upcoming Darshan windows and Aarti ceremonies here.</p>
              </div>
            )}
            {!loading && events.map((event) => (
              <EventOption
                key={event.eventId}
                event={event}
                groupSize={groupSize}
                selected={selectedEventId === event.eventId}
                onSelect={() => { setSelectedEventId(event.eventId); setBooking(null) }}
              />
            ))}
          </div>
        </section>

        <aside className="booking-aside" aria-label="Reservation summary">
          <div className="summary-topline"><span>Reservation summary</span><span className="summary-dot" aria-hidden="true" /></div>
          {selected ? (
            <>
              <p className="summary-type">{selected.eventType === 'DARSHAN' ? 'General Darshan' : 'Aarti ceremony'}</p>
              <h2>{selected.title}</h2>
              <dl className="summary-details">
                <div><dt>Date</dt><dd>{formatDate(selected.serviceDate)}</dd></div>
                <div><dt>Time</dt><dd>{formatTime(selected.startsAt)}</dd></div>
                <div><dt>Group</dt><dd>{groupSize} {groupSize === 1 ? 'person' : 'people'}</dd></div>
                <div><dt>Places left</dt><dd>{selected.availableCount}</dd></div>
              </dl>
              <p className="summary-help" id="booking-action-help">
                {selected.status === 'CANCELLED' ? 'This visit has been cancelled.'
                  : selected.status !== 'OPEN' ? 'Bookings are closed for this time.'
                    : selected.maxGroupSize < groupSize ? `This time allows up to ${selected.maxGroupSize} people in one group.`
                      : selected.availableCount < groupSize ? `This time cannot fit all ${groupSize} people in your group.`
                        : 'Review your visit details, then confirm your reservation.'}
              </p>
              <button className="button button-primary button-wide" type="button" onClick={handleBooking} disabled={!canReserve || bookingBusy} aria-describedby="booking-action-help">
                {bookingBusy ? 'Reserving…' : 'Confirm reservation'}
              </button>
            </>
          ) : (
            <div className="summary-empty">
              <div className="empty-mark small" aria-hidden="true"><CalendarGlyph /></div>
              <h2>Choose a visit time</h2>
              <p>Select one of the schedule cards to see your group’s reservation details.</p>
            </div>
          )}
          <p className="summary-policy">No payment is required. Your pass is valid only for the selected date and time.</p>
        </aside>
      </div>

      {booking && <PassConfirmation booking={booking} onClose={() => setBooking(null)} />}
    </>
  )
}

function EventOption({ event, groupSize, selected, onSelect }: {
  event: TempleEvent
  groupSize: number
  selected: boolean
  onSelect: () => void
}) {
  const state = event.availability.toLowerCase()
  return (
    <button type="button" className={`event-option ${selected ? 'event-option-selected' : ''} event-state-${state}`} aria-pressed={selected} onClick={onSelect}>
      <span className="event-date-block">
        <span>{formatWeekday(event.serviceDate)}</span>
        <strong>{formatDay(event.serviceDate)}</strong>
        <span>{formatMonth(event.serviceDate)}</span>
      </span>
      <span className="event-main">
        <span className="event-title-row"><strong>{event.title}</strong><StatusBadge availability={event.availability} /></span>
        <span className="event-detail">{event.eventType === 'AARTI' ? 'Aarti' : 'General Darshan'} · {formatTime(event.startsAt)}</span>
      </span>
      <span className="event-availability">
        <strong>{event.remainingPlaces}</strong>
        <span>{event.remainingPlaces === 1 ? 'place left' : 'places left'}</span>
        {event.maxGroupSize < groupSize && <small>Group limit {event.maxGroupSize}</small>}
      </span>
      <span className="event-chevron" aria-hidden="true">›</span>
    </button>
  )
}

function StatusBadge({ availability }: { availability: TempleEvent['availability'] }) {
  const labels: Record<TempleEvent['availability'], string> = {
    AVAILABLE: 'Available',
    LIMITED: 'Filling up',
    FULL: 'Fully booked',
    CLOSED: 'Bookings closed',
    CANCELLED: 'Cancelled',
  }
  return <span className={`status-badge status-${availability.toLowerCase()}`}>{labels[availability]}</span>
}

function PassConfirmation({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    function keepFocusInside(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', keepFocusInside)
    return () => {
      document.removeEventListener('keydown', keepFocusInside)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  return (
    <div className="confirmation-backdrop" role="presentation">
      <section ref={panelRef} className="confirmation-panel" role="dialog" aria-modal="true" aria-labelledby="confirmation-title" tabIndex={-1}>
        <button ref={closeButtonRef} className="close-button" type="button" aria-label="Close reservation details" onClick={onClose}>×</button>
        <div className="confirmation-check" aria-hidden="true">✓</div>
        <p className="eyebrow">Reservation confirmed</p>
        <h2 id="confirmation-title">Your visit is saved.</h2>
        <p className="confirmation-intro">Show this pass to temple staff when your group arrives.</p>
        <div className="pass-card">
          {booking.pass && <QRCodeSVG value={booking.pass.qr_value} size={176} level="M" title={`QR code for booking ${booking.bookingId}`} />}
          <div className="pass-details">
            <strong>{booking.title}</strong>
            <span>{formatDate(booking.serviceDate)} · {formatTime(booking.startsAt)}</span>
            <span>{booking.partySize} {booking.partySize === 1 ? 'person' : 'people'}</span>
            <small>Booking reference</small>
            <code>{booking.bookingId}</code>
          </div>
        </div>
        <p className="quiet-note">This pass is valid only for the visit shown above. You can find it again under My passes.</p>
        <button className="button button-primary button-wide" type="button" onClick={onClose}>Done</button>
      </section>
    </div>
  )
}

function BookingHistory() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadBookings() {
    setLoading(true)
    setError('')
    try {
      setBookings(await getMyBookings())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your passes could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadBookings() }, [])

  async function handleCancel(booking: Booking) {
    if (!window.confirm(`Cancel the reservation for ${booking.partySize} ${booking.partySize === 1 ? 'person' : 'people'}?`)) return
    setError('')
    try {
      await cancelBooking(booking.bookingId)
      await loadBookings()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The reservation could not be cancelled.')
    }
  }

  return (
    <section className="history-page" aria-labelledby="history-heading">
      <div className="page-intro compact-intro">
        <div><p className="eyebrow">Your account</p><h1 id="history-heading">My passes</h1><p className="intro-copy">Upcoming reservations and past visits for your account.</p></div>
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {loading && <p className="loading-copy" aria-live="polite">Loading your passes…</p>}
      {!loading && bookings.length === 0 && !error && (
        <div className="empty-state history-empty"><div className="empty-mark" aria-hidden="true"><PassGlyph /></div><h2>No passes yet</h2><p>When you reserve a visit, your confirmation and QR pass will appear here.</p></div>
      )}
      <div className="history-list">
        {bookings.map((booking) => {
          const canCancel = booking.status === 'CONFIRMED'
            && booking.eventStatus !== 'CANCELLED'
            && new Date(booking.startsAt).getTime() > Date.now()
          return (
            <article className="history-card" key={booking.bookingId}>
              <div className="history-card-main">
                <div className="history-card-heading">
                  <div><p className="eyebrow">{booking.visitType === 'AARTI' ? 'Aarti ceremony' : 'General Darshan'}</p><h2>{booking.title}</h2></div>
                  <BookingStatus status={booking.status} eventStatus={booking.eventStatus} />
                </div>
                <div className="history-meta"><span>{formatDate(booking.serviceDate)}</span><span>{formatTime(booking.startsAt)}</span><span>{booking.partySize} {booking.partySize === 1 ? 'person' : 'people'}</span></div>
                <p className="reference-line">Reference <code>{booking.bookingId}</code></p>
                {booking.eventStatus === 'CANCELLED' && <p className="notice notice-error">This scheduled visit was cancelled. Contact temple staff for guidance.</p>}
                {booking.status === 'CHECKED_IN' && <p className="notice notice-success">Your group was checked in.</p>}
                {canCancel && <button className="button button-outline button-small" type="button" onClick={() => handleCancel(booking)}>Cancel reservation</button>}
              </div>
              {booking.pass && booking.status === 'CONFIRMED' && (
                <div className="history-qr"><QRCodeSVG value={booking.pass.qr_value} size={108} level="M" title={`QR code for booking ${booking.bookingId}`} /><span>Show at entry</span></div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function BookingStatus({ status, eventStatus }: { status: Booking['status']; eventStatus: Booking['eventStatus'] }) {
  const label = eventStatus === 'CANCELLED' ? 'Event cancelled'
    : status === 'CONFIRMED' ? 'Confirmed'
      : status === 'CHECKED_IN' ? 'Checked in' : 'Cancelled'
  return <span className={`status-badge booking-status-${status.toLowerCase()}`}>{label}</span>
}

function formatDate(value: string): string {
  const date = new Date(`${value || '1970-01-01'}T12:00:00Z`)
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)
}

function formatWeekday(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
}

function formatMonth(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(value))
}

function DarshanGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" focusable="false"><path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6"/></svg>
}

function AartiGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" focusable="false"><path d="M12 3c2.4 3.1 3.4 5.1 3.4 7.2a3.4 3.4 0 1 1-6.8 0C8.6 8.1 9.6 6.1 12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M5 18h14m-11 3h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
}

function CalendarGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" focusable="false"><rect x="4" y="5.5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M8 3.5v4m8-4v4M4 10h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
}

function PassGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" focusable="false"><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M8 8h3v3H8zm5 0h3v3h-3zm-5 5h3v3H8zm5 2h3m-1.5-2v4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
}
