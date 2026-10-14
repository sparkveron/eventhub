import { apiRequest } from './api'
import type {
  LoginCredentials,
  LoginResponse,
  RegisterPayload,
  TokenRefreshResponse,
  User,
} from '../types/auth'

const ACCESS_TOKEN_KEY = 'eventhub_access_token'
const REFRESH_TOKEN_KEY = 'eventhub_refresh_token'

export function getStoredTokens() {
  return {
    accessToken: window.localStorage.getItem(ACCESS_TOKEN_KEY),
    refreshToken: window.localStorage.getItem(REFRESH_TOKEN_KEY),
  }
}

export function storeTokens(accessToken: string, refreshToken: string) {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export function storeAccessToken(accessToken: string) {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
}

export function clearStoredTokens() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY)
  window.localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function registerUser(payload: RegisterPayload) {
  return apiRequest<User>('/auth/register/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function loginUser(credentials: LoginCredentials) {
  return apiRequest<LoginResponse>('/auth/login/', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export function refreshAccessToken(refreshToken: string) {
  return apiRequest<TokenRefreshResponse>('/auth/refresh/', {
    method: 'POST',
    body: JSON.stringify({ refresh: refreshToken }),
  })
}

export function getCurrentUser(accessToken: string) {
  return apiRequest<User>('/auth/me/', {
    token: accessToken,
  })
}
