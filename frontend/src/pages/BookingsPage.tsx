import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { ReservationCountdown } from '../components/ReservationCountdown'
import { useAuth } from '../context/AuthContext'
import {
  cancelBooking,
  getBooking,
  getBookings,
  initializeBookingPayment,
} from '../services/bookings'
import { getErrorMessage } from '../services/api'
import type { Booking } from '../types/bookings'
import {
  getBookingStatusClass,
  getBookingStatusDescription,
  getBookingStatusLabel,
} from '../utils/bookingStatus'
import { formatDisplayName } from '../utils/displayName'
import { formatCurrency, formatEventDate, formatEventTime } from '../utils/formatters'
import { hasPendingReservationDeadlinePassed } from '../utils/reservations'

function canCancelBooking(booking: Booking) {
  return (
    (booking.status === 'pending' || booking.status === 'confirmed') &&
    !hasPendingReservationDeadlinePassed(booking)
  )
}

function canStartPayment(booking: Booking) {
  return booking.status === 'pending' && !hasPendingReservationDeadlinePassed(booking)
}

const modalAnimationDuration = 180

export function BookingsPage() {
  const { authenticatedRequest, user } = useAuth()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [isBookingModalClosing, setIsBookingModalClosing] = useState(false)
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null)
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [next, setNext] = useState<string | null>(null)
  const [previous, setPrevious] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [payingBookingReference, setPayingBookingReference] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const modalCloseTimerRef = useRef<number | null>(null)
  const pageSize = 10

  const closeBookingDetail = useCallback(() => {
    if (!selectedBooking || isBookingModalClosing) {
      return
    }

    setIsBookingModalClosing(true)
    modalCloseTimerRef.current = window.setTimeout(() => {
      setSelectedBooking(null)
      setIsBookingModalClosing(false)
      modalCloseTimerRef.current = null
    }, modalAnimationDuration)
  }, [isBookingModalClosing, selectedBooking])

  useEffect(() => {
    if (!selectedBooking) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeBookingDetail()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [closeBookingDetail, selectedBooking])

  useEffect(() => {
    return () => {
      if (modalCloseTimerRef.current) {
        window.clearTimeout(modalCloseTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)

    getBookings(authenticatedRequest, { page, page_size: pageSize })
      .then((response) => {
        if (isMounted) {
          setBookings(response.results)
          setCount(response.count)
          setNext(response.next)
          setPrevious(response.previous)
          setError(null)
        }
      })
      .catch((caughtError) => {
        if (isMounted) {
          setBookings([])
          setCount(0)
          setNext(null)
          setPrevious(null)
          setError(getErrorMessage(caughtError))
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [authenticatedRequest, page])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / pageSize)), [count])

  async function openBookingDetail(bookingReference: string) {
    if (modalCloseTimerRef.current) {
      window.clearTimeout(modalCloseTimerRef.current)
      modalCloseTimerRef.current = null
    }

    setIsBookingModalClosing(false)
    setIsLoadingDetail(true)
    setDetailError(null)
    try {
      const response = await getBooking(authenticatedRequest, bookingReference)
      setSelectedBooking(response)
    } catch (caughtError) {
      setDetailError(getErrorMessage(caughtError))
    } finally {
      setIsLoadingDetail(false)
    }
  }

  const refreshSelectedBooking = useCallback(async () => {
    if (!selectedBooking) {
      return
    }

    try {
      const response = await getBooking(authenticatedRequest, selectedBooking.booking_reference)
      setSelectedBooking(response)
      setBookings((current) =>
        current.map((booking) =>
          booking.booking_reference === response.booking_reference ? response : booking,
        ),
      )
    } catch (caughtError) {
      setDetailError(getErrorMessage(caughtError))
    }
  }, [authenticatedRequest, selectedBooking])

  async function confirmCancelBooking() {
    if (!bookingToCancel) {
      return
    }

    setIsCancelling(true)
    setDetailError(null)
    try {
      const response = await cancelBooking(
        authenticatedRequest,
        bookingToCancel.booking_reference,
      )
      const updatedBooking = response.booking
      setBookings((current) =>
        current.map((booking) =>
          booking.booking_reference === updatedBooking.booking_reference
            ? updatedBooking
            : booking,
        ),
      )
      setSelectedBooking((current) =>
        current?.booking_reference === updatedBooking.booking_reference
          ? updatedBooking
          : current,
      )
      setSuccessMessage(response.detail)
      setBookingToCancel(null)
    } catch (caughtError) {
      setDetailError(getErrorMessage(caughtError))
    } finally {
      setIsCancelling(false)
    }
  }

  async function startPayment(bookingReference: string) {
    setPayingBookingReference(bookingReference)
    setDetailError(null)
    try {
      const response = await initializeBookingPayment(authenticatedRequest, bookingReference)
      window.location.assign(response.authorization_url)
    } catch (caughtError) {
      setDetailError(getErrorMessage(caughtError))
    } finally {
      setPayingBookingReference(null)
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          My bookings
        </p>
        <h1 className="page-title">Your EventHub bookings</h1>
        <p className="page-subtitle">
          Review booking references, ticket lines, totals, and cancellation status.
        </p>
      </section>

      {successMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      {isLoading ? <LoadingState label="Loading bookings" /> : null}
      {!isLoading && error ? <ErrorState description={error} /> : null}
      {!isLoading && !error && bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          description="Bookings you create from public event pages will appear here."
        />
      ) : null}

      {!isLoading && !error && bookings.length > 0 ? (
        <section className="grid gap-5">
          {bookings.map((booking) => {
            const isInactive = booking.status === 'cancelled' || booking.status === 'expired'

            return (
            <article
              key={booking.booking_reference}
              className={`card ${isInactive ? 'border-slate-200 bg-slate-100/70' : ''}`}
            >
              <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
                <div className={isInactive ? 'text-slate-500' : ''}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${getBookingStatusClass(booking.status)}`}
                    >
                      {getBookingStatusLabel(booking.status)}
                    </span>
                    <span className="text-sm text-slate-500">
                      {booking.booking_reference}
                    </span>
                  </div>
                  <h2 className={`mt-3 text-xl font-semibold ${isInactive ? 'text-slate-700' : 'text-slate-950'}`}>
                    {booking.event?.title ?? 'Event unavailable'}
                  </h2>
                  {booking.event ? (
                    <p className={`mt-2 text-sm ${isInactive ? 'text-slate-500' : 'text-slate-600'}`}>
                      {formatEventDate(booking.event.start_datetime)} at{' '}
                      {booking.event.venue}, {booking.event.city}
                    </p>
                  ) : null}
                  {booking.status === 'expired' ? (
                    <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                      This reservation expired and the tickets have been released. It is not a valid ticket.
                    </p>
                  ) : null}
                  <div
                    className={`mt-4 divide-y rounded-md border ${
                      isInactive
                        ? 'divide-slate-200 border-slate-200 bg-white/50'
                        : 'divide-slate-100 border-slate-200'
                    }`}
                  >
                    {booking.items.map((item) => (
                      <div
                        key={item.id}
                        className="grid gap-2 p-3 text-sm sm:grid-cols-[1fr_auto]"
                      >
                        <span className={isInactive ? 'text-slate-500' : 'text-slate-700'}>
                          {item.ticket_type_name} x {item.quantity}
                        </span>
                        <span className={`font-semibold ${isInactive ? 'text-slate-700' : 'text-slate-950'}`}>
                          {formatCurrency(item.subtotal)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className={`mt-4 text-lg font-semibold ${isInactive ? 'text-slate-700' : 'text-slate-950'}`}>
                    Booking total: {formatCurrency(booking.total_amount)}
                  </p>
                  {booking.status === 'expired' ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Recorded reservation value; no payment was processed.
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-slate-500">
                    Booked on {formatEventDate(booking.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => openBookingDetail(booking.booking_reference)}
                  >
                    View Details
                  </button>
                  {booking.event ? (
                    <Link to={`/events/${booking.event.slug}`} className="btn btn-secondary">
                      Event
                    </Link>
                  ) : null}
                  <Link
                    to={`/bookings/${booking.booking_reference}/ticket`}
                    className="btn btn-primary"
                  >
                    View Ticket
                  </Link>
                  {canStartPayment(booking) ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={payingBookingReference === booking.booking_reference}
                      onClick={() => startPayment(booking.booking_reference)}
                    >
                      {payingBookingReference === booking.booking_reference ? 'Starting payment...' : 'Pay Now'}
                    </button>
                  ) : null}
                  {canCancelBooking(booking) ? (
                    <button
                      type="button"
                      className="btn border border-red-200 bg-white text-red-700 hover:bg-red-50"
                      onClick={() => {
                        setDetailError(null)
                        setBookingToCancel(booking)
                      }}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
            )
          })}

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!previous}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!next}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </section>
      ) : null}

      {isLoadingDetail ? <LoadingState label="Loading booking details" /> : null}
      {detailError ? <ErrorState title="Booking action failed" description={detailError} /> : null}
      {selectedBooking ? (
        <div
          className={`fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6 ${
            isBookingModalClosing ? 'modal-backdrop-exit' : 'modal-backdrop-enter'
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-details-title"
          onMouseDown={closeBookingDetail}
        >
          <section
            className={`max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl ${
              isBookingModalClosing ? 'modal-panel-exit' : 'modal-panel-enter'
            }`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Booking Details
                  </p>
                  <h2 id="booking-details-title" className="mt-2 text-2xl font-semibold text-slate-950">
                    {selectedBooking.booking_reference}
                  </h2>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeBookingDetail}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-slate-500">Event</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {selectedBooking.event?.title ?? 'Event unavailable'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Status</dt>
                  <dd className="mt-1">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${getBookingStatusClass(selectedBooking.status)}`}
                    >
                      {getBookingStatusLabel(selectedBooking.status)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Status note</dt>
                  <dd className="mt-1 text-slate-700">
                    {getBookingStatusDescription(selectedBooking.status)}
                  </dd>
                </div>
                {selectedBooking.status === 'pending' || selectedBooking.status === 'expired' ? (
                  <div className="sm:col-span-2">
                    <dt className="font-medium text-slate-500">Reservation</dt>
                    <dd className="mt-1">
                      <ReservationCountdown
                        expiresAt={selectedBooking.expires_at}
                        status={selectedBooking.status}
                        onDeadlinePassed={refreshSelectedBooking}
                      />
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="font-medium text-slate-500">Booking date</dt>
                  <dd className="mt-1 text-slate-700">
                    {formatEventDate(selectedBooking.created_at)} at{' '}
                    {formatEventTime(selectedBooking.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Booking total</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {formatCurrency(selectedBooking.total_amount)}
                  </dd>
                  {selectedBooking.status === 'expired' ? (
                    <dd className="mt-1 text-xs text-slate-500">
                      Historical reservation value; no payment was processed.
                    </dd>
                  ) : null}
                </div>
                {selectedBooking.event ? (
                  <>
                    <div>
                      <dt className="font-medium text-slate-500">Event date</dt>
                      <dd className="mt-1 text-slate-700">
                        {formatEventDate(selectedBooking.event.start_datetime)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Event time</dt>
                      <dd className="mt-1 text-slate-700">
                        {formatEventTime(selectedBooking.event.start_datetime)} -{' '}
                        {formatEventTime(selectedBooking.event.end_datetime)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Venue</dt>
                      <dd className="mt-1 text-slate-700">
                        {selectedBooking.event.venue}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Location</dt>
                      <dd className="mt-1 text-slate-700">
                        {selectedBooking.event.address}, {selectedBooking.event.city}
                      </dd>
                    </div>
                  </>
                ) : null}
                <div>
                  <dt className="font-medium text-slate-500">Attendee</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {formatDisplayName(user?.username) || 'Attendee'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Email</dt>
                  <dd className="mt-1 text-slate-700">{user?.email ?? 'Unavailable'}</dd>
                </div>
              </dl>

              <div className="mt-6 divide-y divide-slate-100 rounded-md border border-slate-200">
                {selectedBooking.items.map((item) => (
                  <div key={item.id} className="grid gap-3 p-4 text-sm lg:grid-cols-4">
                    <div className="font-semibold text-slate-950">{item.ticket_type_name}</div>
                    <div>Quantity: {item.quantity}</div>
                    <div>Unit: {formatCurrency(item.unit_price)}</div>
                    <div className="font-semibold">Subtotal: {formatCurrency(item.subtotal)}</div>
                  </div>
                ))}
              </div>

              {canCancelBooking(selectedBooking) ? (
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <Link
                    to={`/bookings/${selectedBooking.booking_reference}/ticket`}
                    className="btn btn-secondary"
                  >
                    View Ticket
                  </Link>
                  <button
                    type="button"
                    className="btn border border-red-200 bg-white text-red-700 hover:bg-red-50"
                    onClick={() => {
                      setDetailError(null)
                      setBookingToCancel(selectedBooking)
                    }}
                  >
                    Cancel Booking
                  </button>
                  {canStartPayment(selectedBooking) ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={payingBookingReference === selectedBooking.booking_reference}
                      onClick={() => startPayment(selectedBooking.booking_reference)}
                    >
                      {payingBookingReference === selectedBooking.booking_reference ? 'Starting payment...' : 'Pay Now'}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <Link
                    to={`/bookings/${selectedBooking.booking_reference}/ticket`}
                    className="btn btn-secondary"
                  >
                    View Ticket
                  </Link>
                  {canStartPayment(selectedBooking) ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={payingBookingReference === selectedBooking.booking_reference}
                      onClick={() => startPayment(selectedBooking.booking_reference)}
                    >
                      {payingBookingReference === selectedBooking.booking_reference ? 'Starting payment...' : 'Pay Now'}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {bookingToCancel ? (
        <ConfirmDialog
          title="Cancel booking"
          description={`Cancel booking ${bookingToCancel.booking_reference}? Ticket availability will be restored if the backend accepts the cancellation.`}
          confirmLabel="Cancel Booking"
          isBusy={isCancelling}
          onCancel={() => setBookingToCancel(null)}
          onConfirm={confirmCancelBooking}
        />
      ) : null}
    </div>
  )
}
