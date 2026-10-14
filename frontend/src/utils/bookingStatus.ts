import type { BookingStatus } from '../types/bookings'

export function getBookingStatusLabel(status: BookingStatus) {
  if (status === 'confirmed') {
    return 'Confirmed'
  }

  if (status === 'cancelled') {
    return 'Cancelled'
  }

  if (status === 'expired') {
    return 'Expired'
  }

  return 'Pending'
}

export function getBookingStatusClass(status: BookingStatus) {
  if (status === 'confirmed') {
    return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
  }

  if (status === 'cancelled') {
    return 'bg-red-50 text-red-700 ring-1 ring-red-200'
  }

  if (status === 'expired') {
    return 'bg-rose-50 text-rose-800 ring-1 ring-rose-200'
  }

  return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
}

export function getBookingSuccessTitle(status: BookingStatus) {
  if (status === 'confirmed') {
    return 'Booking confirmed'
  }

  if (status === 'cancelled') {
    return 'Booking created'
  }

  if (status === 'expired') {
    return 'Reservation expired'
  }

  return 'Booking received'
}

export function getBookingStatusDescription(status: BookingStatus) {
  if (status === 'confirmed') {
    return 'Your booking is confirmed.'
  }

  if (status === 'cancelled') {
    return 'This booking is cancelled.'
  }

  if (status === 'expired') {
    return 'This reservation expired, the tickets have been released, and it is not a valid ticket.'
  }

  return 'Your booking is pending. It has not been marked as paid or confirmed.'
}
