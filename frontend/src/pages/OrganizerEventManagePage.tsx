import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorState } from '../components/ErrorState'
import { EventForm } from '../components/EventForm'
import { EventImage } from '../components/EventImage'
import { EventPerformanceSection } from '../components/EventPerformanceSection'
import { LoadingState } from '../components/LoadingState'
import { TicketTypeForm } from '../components/TicketTypeForm'
import { TicketTypeList } from '../components/TicketTypeList'
import { useAuth } from '../context/AuthContext'
import {
  createTicketType,
  deleteEvent,
  deleteTicketType,
  getCategories,
  getEventTickets,
  getMyEvent,
  publishEvent,
  updateEvent,
  updateTicketType,
} from '../services/events'
import type { Category, Event, EventFormPayload, TicketType, TicketTypeFormPayload } from '../types/events'
import { getErrorMessage } from '../services/api'
import { formatEventDate, formatEventTime } from '../utils/formatters'
import { extractFieldErrors } from '../utils/forms'

type EventFormErrorKey = keyof EventFormPayload
type TicketFormErrorKey = keyof TicketTypeFormPayload
type LocationState = {
  message?: string
}

export function OrganizerEventManagePage() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { authenticatedRequest } = useAuth()
  const [event, setEvent] = useState<Event | null>(null)
  const [tickets, setTickets] = useState<TicketType[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(
    (location.state as LocationState | null)?.message ?? null,
  )
  const [isEditingEvent, setIsEditingEvent] = useState(searchParams.get('edit') === '1')
  const [isSavingEvent, setIsSavingEvent] = useState(false)
  const [eventErrors, setEventErrors] = useState<
    Partial<Record<EventFormErrorKey | 'detail', string>>
  >({})
  const [isAddingTicket, setIsAddingTicket] = useState(false)
  const [editingTicketId, setEditingTicketId] = useState<number | null>(null)
  const [isSavingTicket, setIsSavingTicket] = useState(false)
  const [ticketErrors, setTicketErrors] = useState<
    Partial<Record<TicketFormErrorKey | 'detail', string>>
  >({})
  const [ticketToDelete, setTicketToDelete] = useState<TicketType | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeletingEvent, setIsDeletingEvent] = useState(false)
  const [isPublishingEvent, setIsPublishingEvent] = useState(false)
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [performanceRefreshKey, setPerformanceRefreshKey] = useState(0)

  const refreshPerformance = useCallback(() => {
    setPerformanceRefreshKey((current) => current + 1)
  }, [])

  const loadEvent = useCallback(async () => {
    if (!id) {
      setError('Missing event identifier.')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const [eventResponse, ticketResponse, categoryResponse] = await Promise.all([
        getMyEvent(authenticatedRequest, id),
        getEventTickets(authenticatedRequest, id),
        getCategories(),
      ])
      setEvent(eventResponse)
      setTickets(ticketResponse)
      setCategories(categoryResponse)
      setError(null)
    } catch {
      setEvent(null)
      setTickets([])
      setError('Unable to load this organizer event.')
    } finally {
      setIsLoading(false)
    }
  }, [authenticatedRequest, id])

  useEffect(() => {
    loadEvent()
  }, [loadEvent])

  useEffect(() => {
    setIsEditingEvent(searchParams.get('edit') === '1')
  }, [searchParams])

  async function handleEventSave(payload: EventFormPayload) {
    if (!event) {
      return
    }

    setIsSavingEvent(true)
    setEventErrors({})
    try {
      const updated = await updateEvent(authenticatedRequest, event.id, payload)
      setEvent(updated)
      setTickets(updated.ticket_types)
      setSuccessMessage('Event updated successfully.')
      setIsEditingEvent(false)
      setSearchParams({})
      refreshPerformance()
    } catch (error) {
      setEventErrors(extractFieldErrors<EventFormErrorKey>(error))
    } finally {
      setIsSavingEvent(false)
    }
  }

  async function handleTicketCreate(payload: TicketTypeFormPayload) {
    if (!event) {
      return
    }

    setIsSavingTicket(true)
    setTicketErrors({})
    try {
      const created = await createTicketType(authenticatedRequest, event.id, payload)
      setTickets((current) => [...current, created])
      setIsAddingTicket(false)
      setSuccessMessage('Ticket type added.')
      refreshPerformance()
    } catch (error) {
      setTicketErrors(extractFieldErrors<TicketFormErrorKey>(error))
    } finally {
      setIsSavingTicket(false)
    }
  }

  async function handleTicketUpdate(ticket: TicketType, payload: TicketTypeFormPayload) {
    if (!event) {
      return
    }

    setIsSavingTicket(true)
    setTicketErrors({})
    try {
      const updated = await updateTicketType(authenticatedRequest, event.id, ticket.id, payload)
      setTickets((current) =>
        current.map((currentTicket) => (currentTicket.id === updated.id ? updated : currentTicket)),
      )
      setEditingTicketId(null)
      setSuccessMessage('Ticket type updated.')
      refreshPerformance()
    } catch (error) {
      setTicketErrors(extractFieldErrors<TicketFormErrorKey>(error))
    } finally {
      setIsSavingTicket(false)
    }
  }

  async function confirmTicketDelete() {
    if (!event || !ticketToDelete) {
      return
    }

    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteTicketType(authenticatedRequest, event.id, ticketToDelete.id)
      setTickets((current) => current.filter((ticket) => ticket.id !== ticketToDelete.id))
      setTicketToDelete(null)
      setSuccessMessage('Ticket type deleted.')
      refreshPerformance()
    } catch (error) {
      setDeleteError(getErrorMessage(error))
    } finally {
      setIsDeleting(false)
    }
  }

  async function confirmEventDelete() {
    if (!event) {
      return
    }

    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteEvent(authenticatedRequest, event.id)
      navigate('/dashboard/events', {
        state: { message: 'Event deleted.' },
      })
    } catch (error) {
      setDeleteError(getErrorMessage(error))
    } finally {
      setIsDeleting(false)
      setIsDeletingEvent(false)
    }
  }

  async function confirmEventPublish() {
    if (!event) {
      return
    }

    setIsPublishingEvent(true)
    setPublishError(null)
    try {
      const updated = await publishEvent(authenticatedRequest, event.id)
      setEvent(updated)
      setTickets(updated.ticket_types)
      setSuccessMessage('Event published successfully. It is now available publicly.')
      setShowPublishConfirm(false)
      refreshPerformance()
    } catch (error) {
      setPublishError(getErrorMessage(error))
    } finally {
      setIsPublishingEvent(false)
    }
  }

  if (isLoading) {
    return <LoadingState label="Loading event management" />
  }

  if (error) {
    return <ErrorState description={error} onRetry={loadEvent} />
  }

  if (!event) {
    return (
      <ErrorState
        title="Event unavailable"
        description="This event could not be found for your organizer account."
      />
    )
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0">
          <Link to="/dashboard/events" className="text-sm font-medium text-slate-600 hover:text-slate-950">
            Back to my events
          </Link>
          <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Event management
          </p>
          <h1 className="page-title">{event.title}</h1>
          <p className="page-subtitle">
            Manage event details and ticket inventory with the EventHub API.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:flex-nowrap xl:justify-end">
          {event.status === 'draft' ? (
            <button
              type="button"
              className="btn btn-secondary whitespace-nowrap"
              onClick={() => {
                setPublishError(null)
                setShowPublishConfirm(true)
              }}
            >
              Publish Event
            </button>
          ) : null}
          <Link to={`/events/${event.slug}`} className="btn btn-secondary whitespace-nowrap">
            View Public Event
          </Link>
          <button
            type="button"
            className="btn btn-primary whitespace-nowrap"
            onClick={() => {
              setIsEditingEvent(true)
              setSearchParams({ edit: '1' })
            }}
          >
            Edit Event
          </button>
          <button
            type="button"
            className="btn whitespace-nowrap border border-red-200 bg-white text-red-700 hover:bg-red-50"
            onClick={() => setIsDeletingEvent(true)}
          >
            Delete Event
          </button>
        </div>
      </section>

      {successMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}
      {deleteError ? <ErrorState title="Delete failed" description={deleteError} /> : null}
      {publishError ? <ErrorState title="Publish failed" description={publishError} /> : null}

      {isEditingEvent ? (
        <EventForm
          categories={categories}
          initialEvent={event}
          submitLabel="Save Event"
          isSubmitting={isSavingEvent}
          errors={eventErrors}
          onSubmit={handleEventSave}
        />
      ) : (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="aspect-[16/7] bg-slate-200">
            <EventImage
              src={event.image}
              alt={`${event.title} event`}
              fallbackClassName="flex h-full min-h-44 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-300 text-lg font-semibold text-slate-600"
            />
          </div>
          <div className="grid gap-6 p-6 lg:grid-cols-2">
            <dl className="grid gap-4 text-sm">
              <div>
                <dt className="font-medium text-slate-500">Status</dt>
                <dd className="mt-1 font-semibold text-slate-950">{event.status}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Date and time</dt>
                <dd className="mt-1 text-slate-700">
                  {formatEventDate(event.start_datetime)} from{' '}
                  {formatEventTime(event.start_datetime)} to {formatEventTime(event.end_datetime)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Venue</dt>
                <dd className="mt-1 text-slate-700">{event.venue}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Address</dt>
                <dd className="mt-1 text-slate-700">
                  {event.address}, {event.city}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Category</dt>
                <dd className="mt-1 text-slate-700">
                  {event.category?.name ?? 'Uncategorized'}
                </dd>
              </div>
            </dl>
            <div>
              <h2 className="font-semibold text-slate-950">Description</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">
                {event.description}
              </p>
            </div>
          </div>
        </section>
      )}

      <EventPerformanceSection
        eventId={event.id}
        authenticatedRequest={authenticatedRequest}
        refreshKey={performanceRefreshKey}
      />

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Ticket types</h2>
            <p className="mt-1 text-sm text-slate-600">
              Add and update ticket inventory for this event.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setIsAddingTicket(true)
              setTicketErrors({})
            }}
          >
            Add Ticket Type
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          {isAddingTicket ? (
            <TicketTypeForm
              submitLabel="Add Ticket Type"
              isSubmitting={isSavingTicket}
              errors={ticketErrors}
              onCancel={() => {
                setIsAddingTicket(false)
                setTicketErrors({})
              }}
              onSubmit={handleTicketCreate}
            />
          ) : null}

          <TicketTypeList
            tickets={tickets}
            editingTicketId={editingTicketId}
            onEdit={(ticket) => {
              setEditingTicketId(ticket.id)
              setTicketErrors({})
            }}
            onDelete={setTicketToDelete}
            renderEditForm={(ticket) => (
              <TicketTypeForm
                initialTicket={ticket}
                submitLabel="Save Ticket"
                isSubmitting={isSavingTicket}
                errors={ticketErrors}
                onCancel={() => {
                  setEditingTicketId(null)
                  setTicketErrors({})
                }}
                onSubmit={(payload) => handleTicketUpdate(ticket, payload)}
              />
            )}
          />
        </div>
      </section>

      {ticketToDelete ? (
        <ConfirmDialog
          title="Delete ticket type"
          description={`Delete "${ticketToDelete.name}"? If bookings already reference it, the backend will reject the deletion.`}
          isBusy={isDeleting}
          onCancel={() => {
            setTicketToDelete(null)
            setDeleteError(null)
          }}
          onConfirm={confirmTicketDelete}
        />
      ) : null}

      {isDeletingEvent ? (
        <ConfirmDialog
          title="Delete event"
          description={`Delete "${event.title}"? This removes the event if the backend allows it.`}
          isBusy={isDeleting}
          onCancel={() => {
            setIsDeletingEvent(false)
            setDeleteError(null)
          }}
          onConfirm={confirmEventDelete}
        />
      ) : null}

      {showPublishConfirm ? (
        <ConfirmDialog
          title="Publish event"
          description={`Publish "${event.title}"? Attendees will be able to find it in public event listings and view its public details.`}
          confirmLabel="Publish Event"
          variant="primary"
          isBusy={isPublishingEvent}
          onCancel={() => {
            setShowPublishConfirm(false)
            setPublishError(null)
          }}
          onConfirm={confirmEventPublish}
        />
      ) : null}
    </div>
  )
}
