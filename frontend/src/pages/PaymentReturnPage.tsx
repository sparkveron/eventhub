import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { useAuth } from '../context/AuthContext'
import { getErrorMessage } from '../services/api'
import { verifyBookingPayment } from '../services/bookings'
import type { Booking } from '../types/bookings'
import {
  getBookingStatusClass,
  getBookingStatusDescription,
  getBookingStatusLabel,
} from '../utils/bookingStatus'
import { formatCurrency, formatEventDate } from '../utils/formatters'

export function PaymentReturnPage() {
  const [searchParams] = useSearchParams()
  const { authenticatedRequest } = useAuth()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const paymentReference = searchParams.get('reference') ?? searchParams.get('trxref')
    if (!paymentReference) {
      setError('The payment reference was not returned by Paystack.')
      return
    }

    let isMounted = true
    verifyBookingPayment(authenticatedRequest, paymentReference)
      .then((response) => {
        if (isMounted) {
          setBooking(response.booking)
          setMessage(response.detail)
        }
      })
      .catch((caughtError) => {
        if (isMounted) {
          setError(getErrorMessage(caughtError))
        }
      })

    return () => {
      isMounted = false
    }
  }, [authenticatedRequest, searchParams])

  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <ErrorState title="Payment could not be verified" description={error} />
        <Link to="/bookings" className="btn btn-secondary">
          Back to My Bookings
        </Link>
      </div>
    )
  }

  if (!booking) {
    return <LoadingState label="Verifying payment" />
  }

  const isConfirmed = booking.status === 'confirmed'
  const isExpired = booking.status === 'expired'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Paystack payment return
        </p>
        <h1 className="page-title">
          {isConfirmed ? 'Payment confirmed' : isExpired ? 'Reservation expired' : 'Payment status'}
        </h1>
        <p className="page-subtitle">{message}</p>
      </section>

      <section className="card space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Booking reference</p>
            <p className="mt-1 font-mono text-xl font-semibold text-slate-950">
              {booking.booking_reference}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${getBookingStatusClass(booking.status)}`}>
            {getBookingStatusLabel(booking.status)}
          </span>
        </div>
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-slate-500">Event</p>
            <p className="mt-1 font-semibold text-slate-950">
              {booking.event?.title ?? 'Event unavailable'}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Booking total</p>
            <p className="mt-1 font-semibold text-slate-950">
              {formatCurrency(booking.total_amount)}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Booking date</p>
            <p className="mt-1 text-slate-700">{formatEventDate(booking.created_at)}</p>
          </div>
          <div>
            <p className="text-slate-500">Status note</p>
            <p className="mt-1 text-slate-700">{getBookingStatusDescription(booking.status)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5">
          <Link to="/bookings" className="btn btn-primary">
            View My Bookings
          </Link>
          {isConfirmed ? (
            <Link to={`/bookings/${booking.booking_reference}/ticket`} className="btn btn-secondary">
              View Ticket
            </Link>
          ) : null}
          {!isConfirmed && !isExpired ? (
            <p className="w-full text-sm text-amber-700">
              This booking is not confirmed yet. Do not use it as an entry ticket.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
