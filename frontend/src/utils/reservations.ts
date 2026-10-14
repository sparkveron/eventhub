import type { Booking } from '../types/bookings'

export function getReservationTimeLeftMs(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) {
    return null
  }

  const expiresAtMs = Date.parse(expiresAt)
  if (Number.isNaN(expiresAtMs)) {
    return null
  }

  return expiresAtMs - now
}

export function formatReservationCountdown(milliseconds: number) {
  const safeMilliseconds = Math.max(0, milliseconds)
  const totalSeconds = Math.ceil(safeMilliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function hasPendingReservationDeadlinePassed(booking: Booking) {
  const timeLeft = getReservationTimeLeftMs(booking.expires_at)
  return booking.status === 'pending' && timeLeft !== null && timeLeft <= 0
}
