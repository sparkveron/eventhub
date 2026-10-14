import { ApiError, getErrorMessage } from '../services/api'

export function extractFieldErrors<T extends string>(error: unknown): Partial<Record<T | 'detail', string>> {
  if (!(error instanceof ApiError) || !error.data || typeof error.data !== 'object') {
    const fallback: Partial<Record<T | 'detail', string>> = {}
    fallback.detail = getErrorMessage(error)
    return fallback
  }

  const errors: Partial<Record<T | 'detail', string>> = {}
  Object.entries(error.data as Record<string, unknown>).forEach(([key, value]) => {
    if (Array.isArray(value) && typeof value[0] === 'string') {
      errors[key as T | 'detail'] = value[0]
      return
    }

    if (typeof value === 'string') {
      errors[key as T | 'detail'] = value
    }
  })

  if (Object.keys(errors).length === 0) {
    errors.detail = getErrorMessage(error)
  }

  return errors
}
