import { getIdToken } from './auth'

export type VisitType = 'DARSHAN' | 'AARTI'
export type EventStatus = 'OPEN' | 'CLOSED' | 'CANCELLED'
export type Availability = 'AVAILABLE' | 'LIMITED' | 'FULL' | 'CLOSED' | 'CANCELLED'

export interface TempleEvent {
  eventId: string
  eventType: VisitType
  title: string
  startsAt: string
  endsAt: string
  serviceDate: string
  capacityTotal: number
  reservedCount: number
  walkinCount: number
  checkedInCount: number
  availableCount: number
  remainingPlaces: number
  maxGroupSize: number
  status: EventStatus
  availability: Availability
  utilizationPercent: number
  seriesId?: string
  description?: string
}

export interface TemplePass {
  booking_reference: string
  qr_value: string
}

export interface Booking {
  bookingId: string
  eventId: string
  visitType: VisitType
  title: string
  startsAt: string
  endsAt: string
  serviceDate: string
  partySize: number
  status: 'CONFIRMED' | 'CHECKED_IN' | 'CANCELLED'
  eventStatus: EventStatus
  createdAt?: string
  cancelledAt?: string
  checkedInAt?: string
  pass?: TemplePass
}

export interface DashboardMetrics {
  reservations: number
  expectedPeople: number
  checkedInPeople: number
  placesRemaining: number
  capacityUtilizationPercent: number
}

export interface DashboardData {
  metrics: DashboardMetrics
  events: TempleEvent[]
}

export interface BookingResponse {
  booking: Booking
  created: boolean
}

export interface RecommendationResponse {
  events: TempleEvent[]
  recommendation: (TempleEvent & { reason: string }) | null
}

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiBase) {
    throw new Error('The booking service is not configured. Deploy the AWS stack first.')
  }
  const token = await getIdToken()
  if (!token) throw new Error('Your sign-in has expired. Sign in again to continue.')

  const headers = new Headers(options.headers)
  headers.set('Authorization', token)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${apiBase}${path}`, { ...options, headers })
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const message = data && typeof data.error === 'string'
      ? data.error
      : 'The request could not be completed. Try again.'
    throw new Error(message)
  }
  return data as T
}

export function getEvents(
  visitType: VisitType,
  groupSize: number,
  selectedEventId?: string,
): Promise<RecommendationResponse> {
  const query = new URLSearchParams({ visitType, groupSize: String(groupSize) })
  if (selectedEventId) query.set('selectedEventId', selectedEventId)
  return request(`/events?${query}`)
}

export function createBooking(eventId: string, partySize: number): Promise<BookingResponse> {
  return request('/bookings', {
    method: 'POST',
    body: JSON.stringify({ eventId, partySize }),
  })
}

export async function getMyBookings(): Promise<Booking[]> {
  const response = await request<{ bookings: Booking[] }>('/me/bookings')
  return response.bookings
}

export async function cancelBooking(bookingId: string): Promise<Booking> {
  const response = await request<{ booking: Booking }>(
    `/bookings/${encodeURIComponent(bookingId)}/cancel`,
    { method: 'POST' },
  )
  return response.booking
}

export function createEvent(body: Record<string, unknown>): Promise<{ event: TempleEvent }> {
  return request('/events', { method: 'POST', body: JSON.stringify(body) })
}

export function updateEvent(
  eventId: string,
  changes: Record<string, unknown>,
): Promise<{ event: TempleEvent }> {
  return request(`/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
}

export function getDashboard(): Promise<DashboardData> {
  return request('/admin/dashboard')
}

export async function searchBookings(query: string, eventId?: string): Promise<Booking[]> {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (eventId) params.set('eventId', eventId)
  const response = await request<{ bookings: Booking[] }>(`/admin/bookings?${params}`)
  return response.bookings
}

export function checkIn(reference: string): Promise<{
  status: 'CHECKED_IN' | 'ALREADY_CHECKED_IN'
  bookingId: string
  partySize: number
  message: string
}> {
  return request('/admin/check-in', {
    method: 'POST',
    body: JSON.stringify({ qrValue: reference }),
  })
}

export function addWalkIn(eventId: string, partySize: number): Promise<{ message: string }> {
  return request('/admin/walk-ins', {
    method: 'POST',
    body: JSON.stringify({ eventId, partySize }),
  })
}
