export interface Category {
  id: number
  name: string
  slug: string
  created_at: string
}

export interface Organizer {
  id: number
  username: string
  user_type: 'organizer' | 'attendee'
}

export interface TicketType {
  id: number
  event: number
  name: string
  description: string
  price: string
  quantity: number
  sold: number
  available_tickets: number
  created_at: string
  updated_at: string
}

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed'

export interface Event {
  id: number
  title: string
  slug: string
  description: string
  image: string | null
  venue: string
  address: string
  city: string
  start_datetime: string
  end_datetime: string
  status: EventStatus
  category: Category | null
  organizer: Organizer
  ticket_types: TicketType[]
  created_at: string
  updated_at: string
}

export interface PaginatedEventResponse {
  count: number
  next: string | null
  previous: string | null
  results: Event[]
}

export interface EventQueryParams {
  search?: string
  category?: string
  city?: string
  ordering?: string
  page?: number
  page_size?: number
}

export interface MyEventQueryParams {
  status?: EventStatus | ''
  ordering?: string
  page?: number
  page_size?: number
}

export interface EventFormPayload {
  title: string
  description: string
  venue: string
  address: string
  city: string
  start_datetime: string
  end_datetime: string
  category: number | null
  status?: EventStatus
  image?: File | null
}

export interface TicketTypeFormPayload {
  name: string
  description: string
  price: string
  quantity: number
}
