import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { useAuth } from '../context/AuthContext'
import { getOrganizerBooking, getOrganizerBookings } from '../services/bookings'
import { getMyEvents } from '../services/events'
import { getErrorMessage } from '../services/api'
import type { BookingStatus } from '../types/bookings'
import type { Event } from '../types/events'
import type { OrganizerBooking, OrganizerBookingQueryParams } from '../types/organizerBookings'
import { getBookingStatusClass, getBookingStatusLabel } from '../utils/bookingStatus'
import { formatCurrency, formatEventDate, formatEventTime } from '../utils/formatters'

const pageSize = 10
const modalAnimationDuration = 180
const orderingOptions: Array<{ value: OrganizerBookingQueryParams['ordering']; label: string }> = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'created_at', label: 'Oldest first' },
  { value: 'status', label: 'Status A-Z' },
  { value: '-status', label: 'Status Z-A' },
]

const statusOptions: Array<{ value: BookingStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
]

export function OrganizerBookingsPage() {
  const { authenticatedRequest } = useAuth()
  const [bookings, setBookings] = useState<OrganizerBooking[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [eventFilter, setEventFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<BookingStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [ordering, setOrdering] = useState<OrganizerBookingQueryParams['ordering']>('-created_at')
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [next, setNext] = useState<string | null>(null)
  const [previous, setPrevious] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingEvents, setIsLoadingEvents] = useState(true)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventError, setEventError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<OrganizerBooking | null>(null)
  const [isModalClosing, setIsModalClosing] = useState(false)
  const modalCloseTimerRef = useRef<number | null>(null)

  const closeBookingDetail = useCallback(() => {
    if (!selectedBooking || isModalClosing) {
      return
    }

    setIsModalClosing(true)
    modalCloseTimerRef.current = window.setTimeout(() => {
      setSelectedBooking(null)
      setIsModalClosing(false)
      modalCloseTimerRef.current = null
    }, modalAnimationDuration)
  }, [isModalClosing, selectedBooking])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
      setPage(1)
    }, 350)

    return () => window.clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    let isMounted = true

    async function loadEvents() {
      setIsLoadingEvents(true)
      try {
        const loadedEvents: Event[] = []
        let currentPage = 1
        let hasNext = true

        while (hasNext) {
          const response = await getMyEvents(authenticatedRequest, {
            page: currentPage,
            page_size: 50,
            ordering: 'title',
          })
          loadedEvents.push(...response.results)
          hasNext = response.next !== null
          currentPage += 1
        }

        if (isMounted) {
          setEvents(loadedEvents)
          setEventError(null)
        }
      } catch {
        if (isMounted) {
          setEvents([])
          setEventError('Unable to load organizer events for filtering.')
        }
      } finally {
        if (isMounted) {
          setIsLoadingEvents(false)
        }
      }
    }

    loadEvents()

    return () => {
      isMounted = false
    }
  }, [authenticatedRequest])

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)

    getOrganizerBookings(authenticatedRequest, {
      search: debouncedSearch,
      event: eventFilter,
      status: statusFilter,
      date_from: dateFrom,
      date_to: dateTo,
      ordering,
      page,
      page_size: pageSize,
    })
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
  }, [
    authenticatedRequest,
    dateFrom,
    dateTo,
    debouncedSearch,
    eventFilter,
    ordering,
    page,
    statusFilter,
  ])

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

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / pageSize)), [count])
  const hasActiveFilters = Boolean(
    searchInput || eventFilter || statusFilter || dateFrom || dateTo || ordering !== '-created_at',
  )

  function resetFilters() {
    setSearchInput('')
    setDebouncedSearch('')
    setEventFilter('')
    setStatusFilter('')
    setDateFrom('')
    setDateTo('')
    setOrdering('-created_at')
    setPage(1)
  }

  async function openBookingDetail(bookingReference: string) {
    if (modalCloseTimerRef.current) {
      window.clearTimeout(modalCloseTimerRef.current)
      modalCloseTimerRef.current = null
    }

    setIsModalClosing(false)
    setIsLoadingDetail(true)
    setDetailError(null)
    try {
      const response = await getOrganizerBooking(authenticatedRequest, bookingReference)
      setSelectedBooking(response)
    } catch (caughtError) {
      setDetailError(getErrorMessage(caughtError))
    } finally {
      setIsLoadingDetail(false)
    }
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Organizer bookings
          </p>
          <h1 className="page-title">Review event bookings</h1>
          <p className="page-subtitle">
            Search and filter bookings associated with your own event ticket items.
          </p>
        </div>
        <Link to="/dashboard/events" className="btn btn-secondary">
          My Events
        </Link>
      </section>

      <section className="card">
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <label className="form-label" htmlFor="booking-search">
              Booking reference
            </label>
            <input
              id="booking-search"
              className="form-input mt-2"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search reference"
            />
          </div>
          <div>
            <label className="form-label" htmlFor="booking-event-filter">
              Event
            </label>
            <select
              id="booking-event-filter"
              className="form-input mt-2"
              value={eventFilter}
              disabled={isLoadingEvents}
              onChange={(event) => {
                setEventFilter(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All events</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="booking-status-filter">
              Status
            </label>
            <select
              id="booking-status-filter"
              className="form-input mt-2"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as BookingStatus | '')
                setPage(1)
              }}
            >
              {statusOptions.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="booking-date-from">
              Date from
            </label>
            <input
              id="booking-date-from"
              type="date"
              className="form-input mt-2"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value)
                setPage(1)
              }}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="booking-date-to">
              Date to
            </label>
            <input
              id="booking-date-to"
              type="date"
              className="form-input mt-2"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value)
                setPage(1)
              }}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="booking-ordering">
              Ordering
            </label>
            <select
              id="booking-ordering"
              className="form-input mt-2"
              value={ordering}
              onChange={(event) => {
                setOrdering(event.target.value as OrganizerBookingQueryParams['ordering'])
                setPage(1)
              }}
            >
              {orderingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            {eventError ?? `Showing ${bookings.length} of ${count} bookings`}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!hasActiveFilters}
            onClick={resetFilters}
          >
            Clear filters
          </button>
        </div>
      </section>

      {isLoading ? <LoadingState label="Loading organizer bookings" /> : null}
      {!isLoading && error ? <ErrorState description={error} /> : null}
      {isLoadingDetail ? <LoadingState label="Loading booking details" /> : null}
      {detailError ? <ErrorState title="Booking details unavailable" description={detailError} /> : null}

      {!isLoading && !error && bookings.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? 'No matching bookings' : 'No bookings yet'}
          description={
            hasActiveFilters
              ? 'Adjust or clear your filters to see more organizer bookings.'
              : 'Bookings for your event ticket items will appear here.'
          }
        />
      ) : null}

      {!isLoading && !error && bookings.length > 0 ? (
        <section className="grid gap-4">
          {bookings.map((booking) => (
            <article key={booking.booking_reference} className="card">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${getBookingStatusClass(booking.status)}`}>
                      {getBookingStatusLabel(booking.status)}
                    </span>
                    <span className="font-mono text-sm font-semibold text-slate-950">
                      {booking.booking_reference}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Booked on {formatEventDate(booking.created_at)}
                  </p>
                  <div className="mt-4 grid gap-2">
                    {booking.items.map((item) => (
                      <div
                        key={`${booking.booking_reference}-${item.event_id}-${item.ticket_type_id}`}
                        className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-slate-950">{item.event_title}</p>
                        <p className="mt-1 text-slate-600">
                          {item.ticket_type_name} x {item.quantity}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3 xl:min-w-48 xl:items-end">
                  <div className="xl:text-right">
                    <p className="text-sm font-medium text-slate-500">Booking value</p>
                    <p className="mt-1 text-xl font-semibold text-slate-950">
                      {formatCurrency(booking.booking_value)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => openBookingDetail(booking.booking_reference)}
                  >
                    View Details
                  </button>
                </div>
              </div>
            </article>
          ))}

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

      {selectedBooking ? (
        <div
          className={`fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6 ${
            isModalClosing ? 'modal-backdrop-exit' : 'modal-backdrop-enter'
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="organizer-booking-details-title"
          onMouseDown={closeBookingDetail}
        >
          <section
            className={`max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl ${
              isModalClosing ? 'modal-panel-exit' : 'modal-panel-enter'
            }`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Booking details
                  </p>
                  <h2 id="organizer-booking-details-title" className="mt-2 text-2xl font-semibold text-slate-950">
                    {selectedBooking.booking_reference}
                  </h2>
                </div>
                <button type="button" className="btn btn-secondary" onClick={closeBookingDetail}>
                  Close
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="font-medium text-slate-500">Status</dt>
                  <dd className="mt-1">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${getBookingStatusClass(selectedBooking.status)}`}>
                      {getBookingStatusLabel(selectedBooking.status)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Booking date</dt>
                  <dd className="mt-1 text-slate-700">
                    {formatEventDate(selectedBooking.created_at)} at {formatEventTime(selectedBooking.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Updated</dt>
                  <dd className="mt-1 text-slate-700">
                    {formatEventDate(selectedBooking.updated_at)} at {formatEventTime(selectedBooking.updated_at)}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Booking value</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {formatCurrency(selectedBooking.booking_value)}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 grid gap-3">
                {selectedBooking.events.map((event) => (
                  <div key={event.id} className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="font-semibold text-slate-950">{event.title}</p>
                    <Link to={`/dashboard/events/${event.id}`} className="mt-1 inline-flex text-sm font-medium text-slate-600 hover:text-slate-950">
                      Manage event
                    </Link>
                  </div>
                ))}
              </div>

              <div className="mt-6 divide-y divide-slate-100 rounded-md border border-slate-200">
                {selectedBooking.items.map((item) => (
                  <div
                    key={`${selectedBooking.booking_reference}-${item.event_id}-${item.ticket_type_id}`}
                    className="grid gap-3 p-4 text-sm lg:grid-cols-[1fr_auto_auto_auto]"
                  >
                    <div>
                      <p className="font-semibold text-slate-950">{item.ticket_type_name}</p>
                      <p className="mt-1 text-slate-600">{item.event_title}</p>
                    </div>
                    <div>Quantity: {item.quantity}</div>
                    <div>Unit: {formatCurrency(item.unit_price)}</div>
                    <div className="font-semibold">Subtotal: {formatCurrency(item.subtotal)}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
