import type { BookingStatus } from './bookings'
import type { Event } from './events'

export interface OrganizerAnalyticsSummary {
  total_events: number
  draft_events: number
  published_events: number
  cancelled_events: number
  completed_events: number
  total_ticket_capacity: number
  tickets_sold: number
  tickets_available: number
  booking_value: string | number
  booking_value_statuses: BookingStatus[]
  pending_bookings: number
  confirmed_bookings: number
  cancelled_bookings: number
  expired_bookings: number
}

export interface OrganizerAnalyticsBookingEvent {
  id: number
  title: string
  slug: string
}

export interface OrganizerAnalyticsTicketSummary {
  ticket_type_id: number
  ticket_type_name: string
  event_id: number
  event_title: string
  quantity: number
  subtotal: string | number
}

export interface OrganizerAnalyticsRecentBooking {
  booking_reference: string
  created_at: string
  status: BookingStatus
  total_amount: string | number
  events: OrganizerAnalyticsBookingEvent[]
  ticket_summary: OrganizerAnalyticsTicketSummary[]
}

export interface OrganizerAnalyticsResponse {
  summary: OrganizerAnalyticsSummary
  upcoming_events: Event[]
  recent_bookings: OrganizerAnalyticsRecentBooking[]
}
