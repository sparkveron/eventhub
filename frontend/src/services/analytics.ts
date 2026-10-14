import type { OrganizerAnalyticsResponse } from '../types/analytics'

type AuthenticatedRequest = <T>(path: string, options?: RequestInit) => Promise<T>

export function getOrganizerAnalytics(authenticatedRequest: AuthenticatedRequest) {
  return authenticatedRequest<OrganizerAnalyticsResponse>('/events/analytics/')
}
