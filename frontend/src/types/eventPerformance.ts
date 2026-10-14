import type { BookingStatus } from './bookings'
import type { EventStatus } from './events'

export interface EventPerformanceEvent {
  id: number
  title: string
  slug: string
  status: EventStatus
  start_datetime: string
  end_datetime: string
}

export interface EventPerformanceSummary {
  ticket_capacity: number
  tickets_sold: number
  tickets_available: number
  booking_value: string | number
  booking_value_statuses: BookingStatus[]
  total_bookings: number
  pending_bookings: number
  confirmed_bookings: number
  cancelled_bookings: number
  expired_bookings: number
}

export interface EventPerformanceTicketType {
  id: number
  name: string
  price: string | number
  quantity: number
  sold: number
  available_tickets: number
  booking_value: string | number
}

export interface EventPerformanceBookingItem {
  ticket_type_id: number
  ticket_type_name: string
  quantity: number
  unit_price: string | number
  subtotal: string | number
}

export interface EventPerformanceRecentBooking {
  booking_reference: string
  status: BookingStatus
  created_at: string
  booking_value: string | number
  items: EventPerformanceBookingItem[]
}

export interface EventPerformanceResponse {
  event: EventPerformanceEvent
  summary: EventPerformanceSummary
  ticket_types: EventPerformanceTicketType[]
  recent_bookings: EventPerformanceRecentBooking[]
}
