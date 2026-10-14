import { apiRequest } from './api'
import type {
  Category,
  Event,
  EventFormPayload,
  EventQueryParams,
  MyEventQueryParams,
  PaginatedEventResponse,
  TicketType,
  TicketTypeFormPayload,
} from '../types/events'

type AuthenticatedRequest = <T>(path: string, options?: RequestInit) => Promise<T>

function buildQuery(params: EventQueryParams | MyEventQueryParams = {}) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.set(key, String(value))
    }
  })

  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

function buildEventRequestBody(payload: EventFormPayload) {
  if (!payload.image) {
    const jsonPayload = { ...payload }
    delete jsonPayload.image
    return JSON.stringify(jsonPayload)
  }

  const formData = new FormData()
  formData.set('title', payload.title)
  formData.set('description', payload.description)
  formData.set('venue', payload.venue)
  formData.set('address', payload.address)
  formData.set('city', payload.city)
  formData.set('start_datetime', payload.start_datetime)
  formData.set('end_datetime', payload.end_datetime)

  if (payload.category !== null) {
    formData.set('category', String(payload.category))
  }

  if (payload.status) {
    formData.set('status', payload.status)
  }

  formData.set('image', payload.image)
  return formData
}

export function getEvents(params?: EventQueryParams) {
  return apiRequest<PaginatedEventResponse>(`/events/${buildQuery(params)}`)
}

export function getEvent(idOrSlug: string) {
  return apiRequest<Event>(`/events/${encodeURIComponent(idOrSlug)}/`)
}

export function getCategories() {
  return apiRequest<Category[]>('/events/categories/')
}

export function getMyEvents(
  authenticatedRequest: AuthenticatedRequest,
  params?: MyEventQueryParams,
) {
  return authenticatedRequest<PaginatedEventResponse>(`/events/my/${buildQuery(params)}`)
}

export function getMyEvent(authenticatedRequest: AuthenticatedRequest, id: string | number) {
  return authenticatedRequest<Event>(`/events/${encodeURIComponent(String(id))}/`)
}

export function createEvent(
  authenticatedRequest: AuthenticatedRequest,
  payload: EventFormPayload,
) {
  return authenticatedRequest<Event>('/events/', {
    method: 'POST',
    body: buildEventRequestBody(payload),
  })
}

export function updateEvent(
  authenticatedRequest: AuthenticatedRequest,
  id: string | number,
  payload: Partial<EventFormPayload>,
) {
  return authenticatedRequest<Event>(`/events/${encodeURIComponent(String(id))}/`, {
    method: 'PATCH',
    body: buildEventRequestBody(payload as EventFormPayload),
  })
}

export function deleteEvent(authenticatedRequest: AuthenticatedRequest, id: string | number) {
  return authenticatedRequest<null>(`/events/${encodeURIComponent(String(id))}/`, {
    method: 'DELETE',
  })
}

export function publishEvent(authenticatedRequest: AuthenticatedRequest, id: string | number) {
  return authenticatedRequest<Event>(`/events/${encodeURIComponent(String(id))}/publish/`, {
    method: 'POST',
  })
}

export function getEventTickets(
  authenticatedRequest: AuthenticatedRequest,
  eventId: string | number,
) {
  return authenticatedRequest<TicketType[]>(`/events/${encodeURIComponent(String(eventId))}/tickets/`)
}

export function createTicketType(
  authenticatedRequest: AuthenticatedRequest,
  eventId: string | number,
  payload: TicketTypeFormPayload,
) {
  return authenticatedRequest<TicketType>(
    `/events/${encodeURIComponent(String(eventId))}/tickets/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

export function updateTicketType(
  authenticatedRequest: AuthenticatedRequest,
  eventId: string | number,
  ticketId: string | number,
  payload: Partial<TicketTypeFormPayload>,
) {
  return authenticatedRequest<TicketType>(
    `/events/${encodeURIComponent(String(eventId))}/tickets/${encodeURIComponent(String(ticketId))}/`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )
}

export function deleteTicketType(
  authenticatedRequest: AuthenticatedRequest,
  eventId: string | number,
  ticketId: string | number,
) {
  return authenticatedRequest<null>(
    `/events/${encodeURIComponent(String(eventId))}/tickets/${encodeURIComponent(String(ticketId))}/`,
    { method: 'DELETE' },
  )
}
