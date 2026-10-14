export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired'

export interface BookingEvent {
  id: number
  title: string
  slug: string
  image: string | null
  venue: string
  address: string
  city: string
  start_datetime: string
  end_datetime: string
}

export interface BookingItem {
  id: number
  ticket_type_id: number
  ticket_type_name: string
  event_id: number
  event_title: string
  quantity: number
  unit_price: string
  subtotal: string
  created_at: string
}

export interface Booking {
  booking_reference: string
  event: BookingEvent | null
  status: BookingStatus
  expires_at: string
  total_amount: string
  created_at: string
  updated_at: string
  items: BookingItem[]
}

export interface BookingCreateItem {
  ticket_type: number
  quantity: number
}

export interface BookingCreatePayload {
  items: BookingCreateItem[]
}

export interface PaginatedBookingResponse {
  count: number
  next: string | null
  previous: string | null
  results: Booking[]
}

export interface BookingCancelResponse {
  detail: string
  booking: Booking
}

export interface PaymentInitializationResponse {
  authorization_url: string
  payment_reference: string
  booking_reference: string
  amount: string
  currency: string
  status: 'initialized' | 'pending' | 'successful' | 'failed' | 'abandoned'
}

export interface PaymentVerificationResponse {
  detail: string
  payment_status: PaymentInitializationResponse['status']
  booking: Booking
}
