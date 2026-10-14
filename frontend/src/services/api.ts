const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'

type ApiRequestOptions = RequestInit & {
  token?: string | null
}

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { token, headers, body, ...requestOptions } = options
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const response = await fetch(`${API_URL}${path}`, {
    ...requestOptions,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body,
  })

  const contentType = response.headers.get('content-type')
  const data = contentType?.includes('application/json')
    ? await response.json()
    : null

  if (!response.ok) {
    throw new ApiError('API request failed', response.status, data)
  }

  return data as T
}

function humanizeFieldName(fieldName: string) {
  if (fieldName === 'non_field_errors') {
    return ''
  }

  return fieldName.replaceAll('_', ' ')
}

function extractValidationMessage(data: unknown, fieldName?: string): string | null {
  if (typeof data === 'string') {
    return fieldName ? `${humanizeFieldName(fieldName)}: ${data}` : data
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const message = extractValidationMessage(item, fieldName)
      if (message) {
        return message
      }
    }
    return null
  }

  if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const message = extractValidationMessage(value, key)
      if (message) {
        return message
      }
    }
  }

  return null
}

export function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return 'EventHub could not complete the request. Please try again in a moment.'
    }

    if (typeof error.data === 'string') {
      return error.data
    }

    if (error.data && typeof error.data === 'object') {
      const data = error.data as Record<string, unknown>

      if (typeof data.detail === 'string') {
        return data.detail
      }

      const validationMessage = extractValidationMessage(data)
      if (validationMessage) {
        return validationMessage
      }
    }

    if (error.status === 401) {
      return 'Please log in again before continuing.'
    }

    if (error.status === 403) {
      return 'You do not have permission to perform this action.'
    }

    if (error.status === 404) {
      return 'The requested resource could not be found.'
    }

    return `Request failed with status ${error.status}.`
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}

export { API_URL }
