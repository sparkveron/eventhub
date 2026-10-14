import { useEffect, useMemo, useState } from 'react'

import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { OrganizerEventCard } from '../components/OrganizerEventCard'
import { useAuth } from '../context/AuthContext'
import { deleteEvent, getMyEvents } from '../services/events'
import type { Event, EventStatus } from '../types/events'
import { getErrorMessage } from '../services/api'

const statusOptions: Array<{ value: EventStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'completed', label: 'Completed' },
]

export function OrganizerEventsPage() {
  const { authenticatedRequest } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [statusFilter, setStatusFilter] = useState<EventStatus | ''>('')
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [next, setNext] = useState<string | null>(null)
  const [previous, setPrevious] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const pageSize = 8

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)

    getMyEvents(authenticatedRequest, {
      status: statusFilter,
      ordering: 'start_datetime',
      page,
      page_size: pageSize,
    })
      .then((response) => {
        if (isMounted) {
          setEvents(response.results)
          setCount(response.count)
          setNext(response.next)
          setPrevious(response.previous)
          setError(null)
        }
      })
      .catch(() => {
        if (isMounted) {
          setEvents([])
          setCount(0)
          setNext(null)
          setPrevious(null)
          setError('Unable to load your events.')
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
  }, [authenticatedRequest, page, statusFilter])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / pageSize)), [count])

  async function confirmDelete() {
    if (!eventToDelete) {
      return
    }

    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteEvent(authenticatedRequest, eventToDelete.id)
      setEvents((current) => current.filter((event) => event.id !== eventToDelete.id))
      setCount((current) => Math.max(0, current - 1))
      setEventToDelete(null)
    } catch (error) {
      setDeleteError(getErrorMessage(error))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            My events
          </p>
          <h1 className="page-title">Manage your event catalog</h1>
          <p className="page-subtitle">
            Review drafts, published listings, cancelled events, and completed events.
          </p>
        </div>
      </section>

      <section className="card">
        <label className="form-label" htmlFor="organizer-status-filter">
          Status filter
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            id="organizer-status-filter"
            className="form-input sm:max-w-xs"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as EventStatus | '')
              setPage(1)
            }}
          >
            {statusOptions.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-slate-600">
            Showing {events.length} of {count} events
          </p>
        </div>
      </section>

      {isLoading ? <LoadingState label="Loading your events" /> : null}
      {!isLoading && error ? <ErrorState description={error} /> : null}
      {!isLoading && !error && events.length === 0 ? (
        <EmptyState
          title="No events found"
          description="Create an event or adjust the status filter to see your organizer listings."
        />
      ) : null}
      {!isLoading && !error && events.length > 0 ? (
        <>
          <div className="grid gap-4">
            {events.map((event) => (
              <OrganizerEventCard
                key={event.id}
                event={event}
                onDelete={setEventToDelete}
              />
            ))}
          </div>
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
        </>
      ) : null}

      {eventToDelete ? (
        <ConfirmDialog
          title="Delete event"
          description={`Delete "${eventToDelete.title}"? This cannot be undone if the backend accepts the deletion.`}
          isBusy={isDeleting}
          onCancel={() => {
            setEventToDelete(null)
            setDeleteError(null)
          }}
          onConfirm={confirmDelete}
        />
      ) : null}

      {deleteError ? <ErrorState title="Delete failed" description={deleteError} /> : null}
    </div>
  )
}
