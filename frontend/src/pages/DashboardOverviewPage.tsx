import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { StatCard } from '../components/StatCard'
import { useAuth } from '../context/AuthContext'
import { getOrganizerAnalytics } from '../services/analytics'
import type { OrganizerAnalyticsResponse } from '../types/analytics'
import { getBookingStatusClass, getBookingStatusLabel } from '../utils/bookingStatus'
import { formatDisplayName } from '../utils/displayName'
import { formatCurrency, formatEventDate } from '../utils/formatters'

export function DashboardOverviewPage() {
  const { authenticatedRequest, user } = useAuth()
  const [analytics, setAnalytics] = useState<OrganizerAnalyticsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadAnalytics() {
      setIsLoading(true)
      try {
        const response = await getOrganizerAnalytics(authenticatedRequest)

        if (isMounted) {
          setAnalytics(response)
          setError(null)
        }
      } catch {
        if (isMounted) {
          setAnalytics(null)
          setError('Unable to load organizer analytics.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadAnalytics()

    return () => {
      isMounted = false
    }
  }, [authenticatedRequest])

  if (isLoading) {
    return <LoadingState label="Loading organizer dashboard" />
  }

  if (error) {
    return <ErrorState description={error} />
  }

  if (!analytics) {
    return (
      <EmptyState
        title="Analytics unavailable"
        description="Organizer analytics could not be loaded right now."
      />
    )
  }

  const { summary, upcoming_events: upcomingEvents, recent_bookings: recentBookings } = analytics
  const bookingValueStatuses = summary.booking_value_statuses.join(' + ')

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Organizer dashboard
          </p>
          <h1 className="page-title">Welcome back, {formatDisplayName(user?.username)}</h1>
          <p className="page-subtitle">
            Track your events, ticket inventory, and booking value using live EventHub API data.
          </p>
        </div>
        <Link to="/dashboard/events/new" className="btn btn-primary">
          Create Event
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total events" value={summary.total_events} />
        <StatCard label="Published events" value={summary.published_events} />
        <StatCard label="Draft events" value={summary.draft_events} />
        <StatCard label="Tickets sold" value={summary.tickets_sold} />
        <StatCard label="Tickets available" value={summary.tickets_available} />
        <StatCard label="Ticket capacity" value={summary.total_ticket_capacity} />
        <StatCard
          label="Booking Value"
          value={formatCurrency(summary.booking_value)}
          helper={`${bookingValueStatuses}; excludes cancelled and expired`}
        />
        <StatCard
          label="Inactive events"
          value={summary.cancelled_events + summary.completed_events}
          helper={`${summary.cancelled_events} cancelled / ${summary.completed_events} completed`}
        />
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Recent upcoming events
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Your nearest draft and published events from the analytics API.
            </p>
          </div>
          <Link to="/dashboard/events" className="btn btn-secondary">
            View all events
          </Link>
        </div>

        {upcomingEvents.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <h3 className="font-semibold text-slate-950">No upcoming events</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Create an event to start preparing your public listing and tickets.
            </p>
          </div>
        ) : (
          <div className="mt-6 divide-y divide-slate-100">
            {upcomingEvents.map((event) => (
              <div
                key={event.id}
                className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">{event.title}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatEventDate(event.start_datetime)}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {event.venue}, {event.city}
                  </p>
                </div>
                <Link to={`/dashboard/events/${event.id}`} className="btn btn-secondary md:justify-self-end">
                  Manage
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Recent bookings</h2>
          <p className="mt-1 text-sm text-slate-600">
            Latest booking activity for your event items only.
          </p>
        </div>

        {recentBookings.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <h3 className="font-semibold text-slate-950">No bookings yet</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Bookings for your events will appear here once attendees reserve tickets.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            {recentBookings.map((booking) => (
              <article
                key={booking.booking_reference}
                className="rounded-lg border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
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
                    <div className="mt-4 grid gap-2">
                      {booking.ticket_summary.map((item) => (
                        <div
                          key={`${booking.booking_reference}-${item.ticket_type_id}-${item.event_id}`}
                          className="rounded-md bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200"
                        >
                          <p className="truncate font-medium text-slate-950">
                            {item.event_title}
                          </p>
                          <p className="mt-1 text-slate-600">
                            {item.ticket_type_name} x {item.quantity}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-md bg-white px-4 py-3 ring-1 ring-slate-200 lg:min-w-40 lg:text-right">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Booking value
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">
                      {formatCurrency(booking.total_amount)}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
