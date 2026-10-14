import { API_URL } from '../services/api'

const apiOrigin = new URL(API_URL).origin

export function resolveMediaUrl(path: string | null) {
  if (!path) {
    return null
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  return `${apiOrigin}${path.startsWith('/') ? path : `/${path}`}`
}
