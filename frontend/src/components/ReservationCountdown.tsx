import { useEffect, useRef, useState } from 'react'

import type { BookingStatus } from '../types/bookings'
import { formatReservationCountdown, getReservationTimeLeftMs } from '../utils/reservations'

type ReservationCountdownProps = {
  expiresAt: string | null | undefined
  status: BookingStatus
  onDeadlinePassed?: () => void
}

export function ReservationCountdown({
  expiresAt,
  status,
  onDeadlinePassed,
}: ReservationCountdownProps) {
  const [timeLeftMs, setTimeLeftMs] = useState(() => getReservationTimeLeftMs(expiresAt))
  const hasNotifiedDeadlineRef = useRef(false)
  const followUpRefreshTimerRef = useRef<number | null>(null)
  const onDeadlinePassedRef = useRef(onDeadlinePassed)

  useEffect(() => {
    onDeadlinePassedRef.current = onDeadlinePassed
  }, [onDeadlinePassed])

  useEffect(() => {
    hasNotifiedDeadlineRef.current = false
    setTimeLeftMs(getReservationTimeLeftMs(expiresAt))

    if (followUpRefreshTimerRef.current) {
      window.clearTimeout(followUpRefreshTimerRef.current)
      followUpRefreshTimerRef.current = null
    }

    if (status !== 'pending' || !expiresAt) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      const nextTimeLeft = getReservationTimeLeftMs(expiresAt)
      setTimeLeftMs(nextTimeLeft)

      if (
        nextTimeLeft !== null &&
        nextTimeLeft <= 0 &&
        !hasNotifiedDeadlineRef.current
      ) {
        hasNotifiedDeadlineRef.current = true
        onDeadlinePassedRef.current?.()
        followUpRefreshTimerRef.current = window.setTimeout(() => {
          followUpRefreshTimerRef.current = null
          onDeadlinePassedRef.current?.()
        }, 65000)
      }
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
      if (followUpRefreshTimerRef.current) {
        window.clearTimeout(followUpRefreshTimerRef.current)
        followUpRefreshTimerRef.current = null
      }
    }
  }, [expiresAt, status])

  if (status === 'expired') {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        This reservation expired, the tickets were released, and it is not valid for entry.
      </div>
    )
  }

  if (status !== 'pending' || timeLeftMs === null) {
    return null
  }

  if (timeLeftMs <= 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Reservation deadline passed. Checking the latest booking status from EventHub.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span className="font-semibold">Reservation expires in </span>
      <span className="font-mono font-semibold">{formatReservationCountdown(timeLeftMs)}</span>
      <span>. Complete the next step before the deadline to keep these tickets reserved.</span>
    </div>
  )
}
