import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import { Breadcrumbs } from '../components/Breadcrumbs'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { EventImage } from '../components/EventImage'
import { LoadingState } from '../components/LoadingState'
import { useAuth } from '../context/AuthContext'
import { getErrorMessage } from '../services/api'
import { createBooking } from '../services/bookings'
import { getEvent } from '../services/events'
import type { Booking } from '../types/bookings'
import type { Event } from '../types/events'
import { getBookingStatusLabel, getBookingSuccessTitle } from '../utils/bookingStatus'
import { formatDisplayName } from '../utils/displayName'
import { formatCurrency, formatEventDate, formatEventTime } from '../utils/formatters'
import { formatReservationCountdown, getReservationTimeLeftMs } from '../utils/reservations'

const toastDisplayDuration = 7500
const toastAnimationDuration = 360

export function EventDetailPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { authenticatedRequest, isAuthenticated, user } = useAuth()
  const [event, setEvent] = useState<Event | null>(null)
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [bookingToast, setBookingToast] = useState<Booking | null>(null)
  const [isBookingToastClosing, setIsBookingToastClosing] = useState(false)
  const toastDismissTimerRef = useRef<number | null>(null)
  const toastRemoveTimerRef = useRef<number | null>(null)
  const expirationRefreshTimersRef = useRef<Set<number>>(new Set())

  const loadEvent = useCallback(async (options: { showLoading?: boolean } = {}) => {
    const { showLoading = true } = options

    if (!slug) {
      setIsLoading(false)
      setError('Missing event identifier.')
      return
    }

    if (showLoading) {
      setIsLoading(true)
    }

    try {
      const response = await getEvent(slug)
      setEvent(response)
      setError(null)
    } catch {
      setEvent(null)
      setError('This event could not be loaded. It may not exist or may not be published.')
    } finally {
      if (showLoading) {
        setIsLoading(false)
      }
    }
  }, [slug])

  useEffect(() => {
    let isMounted = true

    loadEvent().finally(() => {
      if (!isMounted) {
        return
      }
    })

    return () => {
      isMounted = false
    }
  }, [loadEvent])

  useEffect(() => {
    setQuantities({})
    setBookingError(null)
    setBookingToast(null)
    setIsBookingToastClosing(false)

    expirationRefreshTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    expirationRefreshTimersRef.current.clear()
  }, [slug])

  const dismissBookingToast = useCallback(() => {
    if (!bookingToast || isBookingToastClosing) {
      return
    }

    if (toastDismissTimerRef.current) {
      window.clearTimeout(toastDismissTimerRef.current)
      toastDismissTimerRef.current = null
    }

    setIsBookingToastClosing(true)
    toastRemoveTimerRef.current = window.setTimeout(() => {
      setBookingToast(null)
      setIsBookingToastClosing(false)
      toastRemoveTimerRef.current = null
    }, toastAnimationDuration)
  }, [bookingToast, isBookingToastClosing])

  useEffect(() => {
    if (!bookingToast || isBookingToastClosing) {
      return undefined
    }

    toastDismissTimerRef.current = window.setTimeout(
      dismissBookingToast,
      toastDisplayDuration,
    )

    return () => {
      if (toastDismissTimerRef.current) {
        window.clearTimeout(toastDismissTimerRef.current)
        toastDismissTimerRef.current = null
      }
    }
  }, [bookingToast, dismissBookingToast, isBookingToastClosing])

  useEffect(() => {
    return () => {
      if (toastDismissTimerRef.current) {
        window.clearTimeout(toastDismissTimerRef.current)
      }

      if (toastRemoveTimerRef.current) {
        window.clearTimeout(toastRemoveTimerRef.current)
      }

      expirationRefreshTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
      expirationRefreshTimersRef.current.clear()
    }
  }, [])

  const selectedItems = useMemo(() => {
    if (!event) {
      return []
    }

    return event.ticket_types
      .map((ticket) => {
        const quantity = Math.max(0, Math.min(quantities[ticket.id] ?? 0, ticket.available_tickets))

        return {
          ticket,
          quantity,
          subtotal: quantity * Number(ticket.price),
        }
      })
      .filter((item) => item.quantity > 0)
  }, [event, quantities])
  const selectedCount = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.quantity, 0),
    [selectedItems],
  )
  const estimatedTotal = useMemo(() => {
    return selectedItems.reduce((total, item) => total + item.subtotal, 0)
  }, [selectedItems])
  const bookingToastReservationTimeLeft = bookingToast?.status === 'pending'
    ? getReservationTimeLeftMs(bookingToast.expires_at)
    : null

  function updateQuantity(ticketId: number, value: number) {
    const ticket = event?.ticket_types.find((item) => item.id === ticketId)
    const maxQuantity = ticket?.available_tickets ?? 0
    const safeValue = Math.max(0, Math.min(value, maxQuantity))

    setQuantities((current) => ({
      ...current,
      [ticketId]: safeValue,
    }))
    setBookingError(null)
  }

  async function handleBookTickets() {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: location.pathname } } })
      return
    }

    if (user?.user_type === 'organizer') {
      setBookingError('Organizer accounts manage events. Please use an attendee account to book tickets.')
      return
    }

    if (selectedItems.length === 0 || isSubmittingBooking) {
      return
    }

    if (toastDismissTimerRef.current) {
      window.clearTimeout(toastDismissTimerRef.current)
      toastDismissTimerRef.current = null
    }

    if (toastRemoveTimerRef.current) {
      window.clearTimeout(toastRemoveTimerRef.current)
      toastRemoveTimerRef.current = null
    }

    setIsSubmittingBooking(true)
    setBookingError(null)
    setIsBookingToastClosing(false)

    try {
      const booking = await createBooking(authenticatedRequest, {
        items: selectedItems.map((item) => ({
          ticket_type: item.ticket.id,
          quantity: item.quantity,
        })),
      })
      setBookingToast(booking)
      setQuantities({})
      await loadEvent({ showLoading: false })

      const reservationTimeLeft = getReservationTimeLeftMs(booking.expires_at)
      if (booking.status === 'pending' && reservationTimeLeft !== null) {
        const timerId = window.setTimeout(() => {
          expirationRefreshTimersRef.current.delete(timerId)
          void loadEvent({ showLoading: false })
        }, Math.max(0, reservationTimeLeft) + 65000)
        expirationRefreshTimersRef.current.add(timerId)
      }
    } catch (caughtError) {
      setBookingError(getErrorMessage(caughtError))
      await loadEvent({ showLoading: false })
    } finally {
      setIsSubmittingBooking(false)
    }
  }

  if (isLoading) {
    return <LoadingState label="Loading event details" />
  }

  if (error) {
    return (
      <ErrorState
        title="Event unavailable"
        description={error}
        onRetry={() => slug && navigate(0)}
      />
    )
  }

  if (!event) {
    return (
      <EmptyState
        title="Event not found"
        description="We could not find this event. Try browsing all published events."
      />
    )
  }

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Events', to: '/events' },
          { label: event.title },
        ]}
      />

      {bookingToast ? (
        <div
          className={`fixed left-4 right-4 top-20 z-40 mx-auto max-w-xl rounded-xl border border-emerald-200 bg-white p-4 shadow-lg shadow-emerald-950/10 sm:left-auto sm:right-8 sm:top-24 sm:w-full ${
            isBookingToastClosing ? 'booking-toast-exit' : 'booking-toast-enter'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg font-semibold text-emerald-700">
              <span aria-hidden="true">&#10003;</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-emerald-950">
                    {getBookingSuccessTitle(bookingToast.status)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Booking reference:{' '}
                    <span className="font-mono font-semibold text-slate-950">
                      {bookingToast.booking_reference}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Status: {getBookingStatusLabel(bookingToast.status)}
                  </p>
                  {bookingToastReservationTimeLeft !== null && bookingToastReservationTimeLeft > 0 ? (
                    <p className="mt-1 text-sm text-amber-700">
                      Reservation expires in {formatReservationCountdown(bookingToastReservationTimeLeft)}.
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xl leading-none text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  aria-label="Dismiss booking confirmation"
                  onClick={dismissBookingToast}
                >
                  &times;
                </button>
              </div>
              <Link
                to="/bookings"
                className="mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
              >
                View My Bookings
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="aspect-[16/7] bg-slate-200">
          <EventImage
            src={event.image}
            alt={`${event.title} event`}
            fallbackClassName="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-300 px-6 text-center text-lg font-semibold text-slate-600"
          />
        </div>
        <div className="grid gap-8 p-6 lg:grid-cols-[1fr_22rem] lg:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium uppercase tracking-wide text-slate-500">
              <span>{event.category?.name ?? 'Event'}</span>
              <span aria-hidden="true">/</span>
              <span>{event.city}</span>
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-normal text-slate-950">
              {event.title}
            </h1>
            <p className="mt-5 whitespace-pre-line text-base leading-8 text-slate-700">
              {event.description}
            </p>
          </div>
          <aside className="card h-fit">
            <dl className="grid gap-4 text-sm">
              <div>
                <dt className="font-medium text-slate-500">Date</dt>
                <dd className="mt-1 font-semibold text-slate-950">
                  {formatEventDate(event.start_datetime)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Time</dt>
                <dd className="mt-1 font-semibold text-slate-950">
                  {formatEventTime(event.start_datetime)} - {formatEventTime(event.end_datetime)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Venue</dt>
                <dd className="mt-1 font-semibold text-slate-950">{event.venue}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Address</dt>
                <dd className="mt-1 text-slate-700">
                  {event.address}, {event.city}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Organizer</dt>
                <dd className="mt-1 text-slate-700">
                  {formatDisplayName(event.organizer.username)}
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Tickets
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">
              Select ticket quantities
            </h2>
          </div>
          {event.ticket_types.length === 0 ? (
            <EmptyState
              title="No tickets available"
              description="This event does not have published ticket types yet."
            />
          ) : (
            <div className="space-y-4">
              {event.ticket_types.map((ticket) => {
                const quantity = quantities[ticket.id] ?? 0
                const isSoldOut = ticket.available_tickets <= 0

                return (
                  <article key={ticket.id} className="card">
                    <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div>
                        <h3 className="text-xl font-semibold text-slate-950">
                          {ticket.name}
                        </h3>
                        {ticket.description ? (
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {ticket.description}
                          </p>
                        ) : null}
                        <p className="mt-3 text-sm text-slate-500">
                          {ticket.available_tickets} available
                        </p>
                        {quantity > 0 ? (
                          <p className="mt-2 text-sm font-medium text-slate-700">
                            Subtotal: {formatCurrency(quantity * Number(ticket.price))}
                          </p>
                        ) : null}
                      </div>
                      <div className="grid gap-3 sm:min-w-40">
                        <p className="text-right text-lg font-semibold text-slate-950 sm:text-left">
                          {formatCurrency(ticket.price)}
                        </p>
                        <label className="form-label" htmlFor={`ticket-${ticket.id}`}>
                          Quantity
                        </label>
                        <select
                          id={`ticket-${ticket.id}`}
                          className="form-input"
                          value={quantity}
                          disabled={isSoldOut}
                          onChange={(changeEvent) =>
                            updateQuantity(ticket.id, Number(changeEvent.target.value))
                          }
                        >
                          {Array.from(
                            { length: Math.min(ticket.available_tickets, 10) + 1 },
                            (_, index) => (
                              <option key={index} value={index}>
                                {index}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        <aside className="card h-fit lg:sticky lg:top-24">
          <h2 className="text-xl font-semibold text-slate-950">Booking summary</h2>
          {bookingError ? (
            <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {bookingError}
            </div>
          ) : null}
          {selectedItems.length > 0 ? (
            <div className="mt-5 space-y-3 border-b border-slate-100 pb-4">
              {selectedItems.map((item) => (
                <div key={item.ticket.id} className="flex justify-between gap-4 text-sm">
                  <span className="text-slate-600">
                    {item.ticket.name} x {item.quantity}
                  </span>
                  <span className="font-medium text-slate-950">
                    {formatCurrency(item.subtotal)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <dl className="mt-5 grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Tickets selected</dt>
              <dd className="font-medium text-slate-950">{selectedCount}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-slate-100 pt-3">
              <dt className="font-medium text-slate-600">Estimated total</dt>
              <dd className="text-xl font-semibold text-slate-950">
                {formatCurrency(estimatedTotal)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            This estimate is for display only. The backend calculates the final booking total.
          </p>
          {user?.user_type === 'organizer' ? (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Organizer accounts cannot book from this attendee checkout.
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary mt-6 w-full"
            disabled={selectedCount === 0 || isSubmittingBooking || user?.user_type === 'organizer'}
            onClick={handleBookTickets}
          >
            {isSubmittingBooking ? 'Booking...' : isAuthenticated ? 'Book Tickets' : 'Login to Book'}
          </button>
          {!isAuthenticated ? (
            <p className="mt-4 text-center text-sm text-slate-600">
              New to EventHub?{' '}
              <Link to="/register" className="font-medium text-slate-950 hover:underline">
                Create an account
              </Link>
            </p>
          ) : null}
        </aside>
      </section>
    </div>
  )
}
