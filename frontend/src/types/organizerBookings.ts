import type { BookingStatus } from './bookings'

export interface OrganizerBookingEvent {
  id: number
  title: string
  slug: string
}

export interface OrganizerBookingItem {
  ticket_type_id: number
  ticket_type_name: string
  event_id: number
  event_title: string
  quantity: number
  unit_price: string | number
  subtotal: string | number
}

export interface OrganizerBooking {
  booking_reference: string
  status: BookingStatus
  created_at: string
  updated_at: string
  booking_value: string | number
  events: OrganizerBookingEvent[]
  items: OrganizerBookingItem[]
}

export interface OrganizerBookingQueryParams {
  search?: string
  event?: string
  status?: BookingStatus | ''
  date_from?: string
  date_to?: string
  ordering?: 'created_at' | '-created_at' | 'status' | '-status'
  page?: number
  page_size?: number
}

export interface PaginatedOrganizerBookingResponse {
  count: number
  next: string | null
  previous: string | null
  results: OrganizerBooking[]
}
