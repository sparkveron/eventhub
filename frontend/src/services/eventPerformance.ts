import type { EventPerformanceResponse } from '../types/eventPerformance'

type AuthenticatedRequest = <T>(path: string, options?: RequestInit) => Promise<T>

export function getEventPerformance(
  authenticatedRequest: AuthenticatedRequest,
  eventId: string | number,
) {
  return authenticatedRequest<EventPerformanceResponse>(
    `/events/${encodeURIComponent(String(eventId))}/performance/`,
  )
}
