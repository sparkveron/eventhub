import type {
  Booking,
  BookingCancelResponse,
  BookingCreatePayload,
  PaginatedBookingResponse,
  PaymentInitializationResponse,
  PaymentVerificationResponse,
} from '../types/bookings'
import type {
  OrganizerBooking,
  OrganizerBookingQueryParams,
  PaginatedOrganizerBookingResponse,
} from '../types/organizerBookings'

type AuthenticatedRequest = <T>(path: string, options?: RequestInit) => Promise<T>

type BookingQueryParams = {
  page?: number
  page_size?: number
}

function buildQuery(params: BookingQueryParams | OrganizerBookingQueryParams = {}) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.set(key, String(value))
    }
  })

  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

export function createBooking(
  authenticatedRequest: AuthenticatedRequest,
  payload: BookingCreatePayload,
) {
  return authenticatedRequest<Booking>('/bookings/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getBookings(
  authenticatedRequest: AuthenticatedRequest,
  params?: BookingQueryParams,
) {
  return authenticatedRequest<PaginatedBookingResponse>(`/bookings/${buildQuery(params)}`)
}

export function getBooking(
  authenticatedRequest: AuthenticatedRequest,
  bookingReference: string,
) {
  return authenticatedRequest<Booking>(`/bookings/${encodeURIComponent(bookingReference)}/`)
}

export function cancelBooking(
  authenticatedRequest: AuthenticatedRequest,
  bookingReference: string,
) {
  return authenticatedRequest<BookingCancelResponse>(
    `/bookings/${encodeURIComponent(bookingReference)}/cancel/`,
    { method: 'POST' },
  )
}

export function initializeBookingPayment(
  authenticatedRequest: AuthenticatedRequest,
  bookingReference: string,
) {
  return authenticatedRequest<PaymentInitializationResponse>(
    `/bookings/${encodeURIComponent(bookingReference)}/payment/initialize/`,
    { method: 'POST' },
  )
}

export function verifyBookingPayment(
  authenticatedRequest: AuthenticatedRequest,
  paymentReference: string,
) {
  return authenticatedRequest<PaymentVerificationResponse>('/bookings/payment/verify/', {
    method: 'POST',
    body: JSON.stringify({ reference: paymentReference }),
  })
}

export function getOrganizerBookings(
  authenticatedRequest: AuthenticatedRequest,
  params?: OrganizerBookingQueryParams,
) {
  return authenticatedRequest<PaginatedOrganizerBookingResponse>(
    `/bookings/organizer/${buildQuery(params)}`,
  )
}

export function getOrganizerBooking(
  authenticatedRequest: AuthenticatedRequest,
  bookingReference: string,
) {
  return authenticatedRequest<OrganizerBooking>(
    `/bookings/organizer/${encodeURIComponent(bookingReference)}/`,
  )
}
