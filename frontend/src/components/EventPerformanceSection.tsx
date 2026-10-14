import { useCallback, useEffect, useState } from 'react'

import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { LoadingState } from './LoadingState'
import { StatCard } from './StatCard'
import { getEventPerformance } from '../services/eventPerformance'
import type { EventPerformanceResponse } from '../types/eventPerformance'
import { getBookingStatusClass, getBookingStatusLabel } from '../utils/bookingStatus'
import { formatCurrency, formatEventDate } from '../utils/formatters'

type AuthenticatedRequest = <T>(path: string, options?: RequestInit) => Promise<T>

type EventPerformanceSectionProps = {
  eventId: string | number
  authenticatedRequest: AuthenticatedRequest
  refreshKey: number
}

export function EventPerformanceSection({
  eventId,
  authenticatedRequest,
  refreshKey,
}: EventPerformanceSectionProps) {
  const [performance, setPerformance] = useState<EventPerformanceResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPerformance = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await getEventPerformance(authenticatedRequest, eventId)
      setPerformance(response)
      setError(null)
    } catch {
      setPerformance(null)
      setError('Unable to load event performance.')
    } finally {
      setIsLoading(false)
    }
  }, [authenticatedRequest, eventId])

  useEffect(() => {
    loadPerformance()
  }, [loadPerformance, refreshKey])

  if (isLoading) {
    return <LoadingState label="Loading event performance" />
  }

  if (error) {
    return <ErrorState title="Performance unavailable" description={error} onRetry={loadPerformance} />
  }

  if (!performance) {
    return (
      <EmptyState
        title="Performance unavailable"
        description="Event performance data could not be loaded right now."
      />
    )
  }

  const { summary, ticket_types: ticketTypes, recent_bookings: recentBookings } = performance
  const bookingValueStatuses = summary.booking_value_statuses.join(' + ')

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">Performance</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Event-level ticket inventory, booking counts, and booking value from recorded booking items.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ticket capacity" value={summary.ticket_capacity} />
        <StatCard label="Tickets sold" value={summary.tickets_sold} />
        <StatCard label="Tickets available" value={summary.tickets_available} />
        <StatCard label="Total bookings" value={summary.total_bookings} />
        <StatCard label="Pending bookings" value={summary.pending_bookings} />
        <StatCard label="Confirmed bookings" value={summary.confirmed_bookings} />
        <StatCard label="Cancelled bookings" value={summary.cancelled_bookings} />
        <StatCard label="Expired bookings" value={summary.expired_bookings} />
        <StatCard
          label="Booking Value"
          value={formatCurrency(summary.booking_value)}
          helper={`${bookingValueStatuses}; excludes cancelled and expired`}
        />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="card">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Ticket type performance</h3>
            <p className="mt-1 text-sm text-slate-600">
              Booking value uses recorded subtotals, not current ticket prices.
            </p>
          </div>

          {ticketTypes.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <h4 className="font-semibold text-slate-950">No ticket types yet</h4>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
                Add ticket types to start tracking inventory and booking value for this event.
              </p>
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
              <div className="hidden bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[minmax(0,1.3fr)_repeat(5,minmax(88px,1fr))] md:gap-3">
                <span>Ticket type</span>
                <span>Price</span>
                <span>Capacity</span>
                <span>Sold</span>
                <span>Available</span>
                <span>Booking value</span>
              </div>
              <div className="divide-y divide-slate-100">
                {ticketTypes.map((ticket) => (
                  <article
                    key={ticket.id}
                    className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[minmax(0,1.3fr)_repeat(5,minmax(88px,1fr))] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">{ticket.name}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase text-slate-500 md:hidden">
                        Price
                      </span>
                      <p className="font-medium text-slate-800">{formatCurrency(ticket.price)}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase text-slate-500 md:hidden">
                        Capacity
                      </span>
                      <p className="font-medium text-slate-800">{ticket.quantity}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase text-slate-500 md:hidden">
                        Sold
                      </span>
                      <p className="font-medium text-slate-800">{ticket.sold}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase text-slate-500 md:hidden">
                        Available
                      </span>
                      <p className="font-medium text-slate-800">{ticket.available_tickets}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase text-slate-500 md:hidden">
                        Booking value
                      </span>
                      <p className="font-semibold text-slate-950">
                        {formatCurrency(ticket.booking_value)}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Recent event bookings</h3>
            <p className="mt-1 text-sm text-slate-600">
              Latest five bookings with ticket items scoped to this event only.
            </p>
          </div>

          {recentBookings.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <h4 className="font-semibold text-slate-950">No bookings yet</h4>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
                Event bookings will appear here after attendees reserve tickets.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {recentBookings.map((booking) => (
                <article
                  key={booking.booking_reference}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-semibold text-slate-950">
                          {booking.booking_reference}
                        </p>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${getBookingStatusClass(booking.status)}`}>
                          {getBookingStatusLabel(booking.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {formatEventDate(booking.created_at)}
                      </p>
                    </div>
                    <div className="rounded-md bg-white px-3 py-2 ring-1 ring-slate-200">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Booking value
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {formatCurrency(booking.booking_value)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2">
                    {booking.items.map((item) => (
                      <div
                        key={`${booking.booking_reference}-${item.ticket_type_id}`}
                        className="rounded-md bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200"
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="font-medium text-slate-950">
                            {item.ticket_type_name} x {item.quantity}
                          </p>
                          <p className="font-semibold text-slate-950">
                            {formatCurrency(item.subtotal)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
