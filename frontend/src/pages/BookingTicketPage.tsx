import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { ReservationCountdown } from '../components/ReservationCountdown'
import { useAuth } from '../context/AuthContext'
import { getErrorMessage } from '../services/api'
import { getBooking } from '../services/bookings'
import type { Booking } from '../types/bookings'
import {
  getBookingStatusClass,
  getBookingStatusDescription,
  getBookingStatusLabel,
} from '../utils/bookingStatus'
import { formatDisplayName } from '../utils/displayName'
import { formatCurrency, formatEventDate, formatEventTime } from '../utils/formatters'
import { resolveMediaUrl } from '../utils/media'

export function BookingTicketPage() {
  const { bookingReference } = useParams()
  const { authenticatedRequest, user } = useAuth()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imageFailed, setImageFailed] = useState(false)
  const eventImageUrl = resolveMediaUrl(booking?.event?.image ?? null)

  const loadBooking = useCallback(async (options: { showLoading?: boolean } = {}) => {
    if (!bookingReference) {
      setError('Missing booking reference.')
      setIsLoading(false)
      return
    }

    if (options.showLoading !== false) {
      setIsLoading(true)
    }

    try {
      const response = await getBooking(authenticatedRequest, bookingReference)
      setBooking(response)
      setError(null)
    } catch (caughtError) {
      setBooking(null)
      setError(getErrorMessage(caughtError))
    } finally {
      if (options.showLoading !== false) {
        setIsLoading(false)
      }
    }
  }, [authenticatedRequest, bookingReference])

  useEffect(() => {
    loadBooking()
  }, [loadBooking])

  useEffect(() => {
    setImageFailed(false)
  }, [eventImageUrl])

  if (isLoading) {
    return <LoadingState label="Loading digital ticket" />
  }

  if (error) {
    return (
      <ErrorState
        title="Ticket unavailable"
        description={error}
      />
    )
  }

  if (!booking) {
    return (
      <ErrorState
        title="Ticket unavailable"
        description="We could not load this booking ticket."
      />
    )
  }

  const printTicket = () => {
    window.print()
  }
  const hasHeaderImage = Boolean(eventImageUrl && !imageFailed)

  return (
    <div className="ticket-page mx-auto max-w-5xl space-y-6">
      <div className="print-hidden flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Digital ticket
          </p>
          <h1 className="page-title">Booking {booking.booking_reference}</h1>
          <p className="page-subtitle">
            Present this booking reference with your account details if requested by the organizer.
          </p>
        </div>
        <Link to="/bookings" className="btn btn-secondary">
          Back to My Bookings
        </Link>
      </div>

      <div className="print-hidden flex flex-wrap items-center justify-end gap-3">
        <button type="button" className="btn btn-primary" onClick={printTicket}>
          Print Ticket
        </button>
        <button type="button" className="btn btn-secondary" onClick={printTicket}>
          Save as PDF
        </button>
        <p className="text-sm text-slate-500">
          To save a PDF, choose "Save as PDF" in your browser print dialog.
        </p>
      </div>

      <section className="ticket-print-area overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div
          className={`ticket-banner relative overflow-hidden px-6 py-7 sm:px-8 ${
            hasHeaderImage
              ? 'bg-slate-100 text-slate-950'
              : 'bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.28),transparent_32%),linear-gradient(135deg,rgba(15,23,42,1),rgba(30,41,59,0.94))] text-white'
          }`}
          style={
            hasHeaderImage
              ? {
                  backgroundImage: `url("${eventImageUrl}")`,
                  backgroundPosition: 'center',
                  backgroundSize: 'cover',
                }
              : undefined
          }
        >
          {eventImageUrl ? (
            <img
              src={eventImageUrl}
              alt=""
              className="ticket-banner-probe pointer-events-none absolute h-px w-px opacity-0"
              onError={() => setImageFailed(true)}
            />
          ) : null}
          <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="min-w-0">
              <div className={`max-w-4xl rounded-xl p-4 sm:p-5 ${
                hasHeaderImage
                  ? 'bg-slate-950/72 text-white shadow-sm ring-1 ring-white/15 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.55)]'
                  : 'bg-white/10 text-white ring-1 ring-white/15'
              }`}>
                <p className={`text-sm font-semibold uppercase tracking-wide ${
                  hasHeaderImage ? 'text-white/90' : 'text-cyan-200'
                }`}>
                  EventHub digital ticket
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-normal sm:text-4xl">
                  {booking.event?.title ?? 'Event unavailable'}
                </h2>
                {booking.event ? (
                  <dl className="mt-6 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-[minmax(8rem,0.8fr)_minmax(9rem,0.9fr)_minmax(10rem,1fr)_minmax(14rem,1.25fr)]">
                    <div className="min-w-0">
                      <dt className={hasHeaderImage ? 'font-medium text-white/75' : 'text-slate-300'}>
                        Date
                      </dt>
                      <dd className="mt-1 font-semibold leading-5">
                        {formatEventDate(booking.event.start_datetime)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className={hasHeaderImage ? 'font-medium text-white/75' : 'text-slate-300'}>
                        Time
                      </dt>
                      <dd className="mt-1 font-semibold leading-5">
                        {formatEventTime(booking.event.start_datetime)} -{' '}
                        {formatEventTime(booking.event.end_datetime)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className={hasHeaderImage ? 'font-medium text-white/75' : 'text-slate-300'}>
                        Venue
                      </dt>
                      <dd className="mt-1 break-words font-semibold leading-5">{booking.event.venue}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className={hasHeaderImage ? 'font-medium text-white/75' : 'text-slate-300'}>
                        Location
                      </dt>
                      <dd className="mt-1 break-words font-semibold leading-5">
                        {booking.event.address}, {booking.event.city}
                      </dd>
                    </div>
                  </dl>
                ) : null}
              </div>
            </div>
            <div className={`max-w-sm lg:min-w-52 ${
              hasHeaderImage
                ? 'text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_0.65)]'
                : 'text-white'
            }`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${
                hasHeaderImage ? 'text-white/85' : 'text-slate-300'
              }`}>
                Status
              </p>
              <span className={`ticket-status-badge mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase shadow-sm ${getBookingStatusClass(booking.status)}`}>
                {getBookingStatusLabel(booking.status)}
              </span>
              <p className={`mt-4 text-xs leading-5 ${
                hasHeaderImage ? 'max-w-56 text-white/95' : 'text-slate-300'
              }`}>
                {getBookingStatusDescription(booking.status)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">Booking reference</p>
                  <p className="mt-2 break-all font-mono text-2xl font-semibold text-slate-950">
                    {booking.booking_reference}
                  </p>
                </div>
                <div className="rounded-lg bg-white px-4 py-3 text-sm ring-1 ring-slate-200">
                  <p className="font-medium text-slate-500">Booked on</p>
                  <p className="mt-1 font-semibold text-slate-950">
                    {formatEventDate(booking.created_at)}
                  </p>
                  <p className="mt-1 text-slate-600">
                    {formatEventTime(booking.created_at)}
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-slate-950">Attendee</h3>
              <dl className="mt-4 grid gap-4 rounded-xl border border-slate-200 p-5 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-slate-500">Name</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {formatDisplayName(user?.username) || 'Attendee'}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Email</dt>
                  <dd className="mt-1 text-slate-700">{user?.email ?? 'Unavailable'}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-slate-950">Tickets</h3>
              <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {booking.items.map((item) => (
                  <div key={item.id} className="grid gap-4 p-5 text-sm sm:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">{item.ticket_type_name}</p>
                      <p className="mt-1 text-slate-600">
                        Quantity {item.quantity} x {formatCurrency(item.unit_price)}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Subtotal
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {formatCurrency(item.subtotal)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <ReservationCountdown
              expiresAt={booking.expires_at}
              status={booking.status}
              onDeadlinePassed={() => loadBooking({ showLoading: false })}
            />

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">Total</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {formatCurrency(booking.total_amount)}
              </p>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                This is the booking value recorded by EventHub. It does not indicate that payment was processed.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-950">Entry note</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {booking.status === 'confirmed'
                  ? 'This booking is confirmed. Keep this ticket available on your device or print it before arriving at the venue.'
                  : booking.status === 'expired'
                    ? 'This reservation expired and the tickets were released. It cannot be used for entry.'
                    : booking.status === 'cancelled'
                      ? 'This booking was cancelled and cannot be used for entry.'
                      : 'This reservation is pending and is not yet a confirmed ticket for entry.'}
              </p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
