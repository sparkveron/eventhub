import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import {
  clearStoredTokens,
  getCurrentUser,
  getStoredTokens,
  loginUser,
  refreshAccessToken,
  registerUser,
  storeAccessToken,
  storeTokens,
} from '../services/auth'
import { ApiError, apiRequest } from '../services/api'
import type { AuthState, LoginCredentials, LoginResponse, RegisterPayload } from '../types/auth'

type AuthContextValue = AuthState & {
  login: (credentials: LoginCredentials) => Promise<LoginResponse>
  register: (payload: RegisterPayload) => Promise<LoginResponse>
  setSession: (session: LoginResponse) => void
  refreshSession: () => Promise<string | null>
  authenticatedRequest: <T>(path: string, options?: RequestInit) => Promise<T>
  logout: () => void
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

type AuthProviderProps = {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>(initialState)

  const logout = useCallback(() => {
    clearStoredTokens()
    setAuthState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
    })
  }, [])

  const setSession = useCallback((session: LoginResponse) => {
    storeTokens(session.access, session.refresh)
    setAuthState({
      user: session.user,
      accessToken: session.access,
      refreshToken: session.refresh,
      isAuthenticated: true,
      isLoading: false,
    })
  }, [])

  const refreshSession = useCallback(async () => {
    const refreshToken = authState.refreshToken ?? getStoredTokens().refreshToken

    if (!refreshToken) {
      logout()
      return null
    }

    try {
      const response = await refreshAccessToken(refreshToken)
      storeAccessToken(response.access)
      const user = await getCurrentUser(response.access)
      setAuthState({
        user,
        accessToken: response.access,
        refreshToken,
        isAuthenticated: true,
        isLoading: false,
      })
      return response.access
    } catch {
      logout()
      return null
    }
  }, [authState.refreshToken, logout])

  useEffect(() => {
    let isMounted = true
    const { accessToken, refreshToken } = getStoredTokens()

    async function restoreSession() {
      if (!accessToken || !refreshToken) {
        if (isMounted) {
          setAuthState((current) => ({ ...current, isLoading: false }))
        }
        return
      }

      try {
        const user = await getCurrentUser(accessToken)
        if (isMounted) {
          setAuthState({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          })
        }
      } catch {
        if (isMounted) {
          try {
            const refreshed = await refreshAccessToken(refreshToken)
            storeAccessToken(refreshed.access)
            const user = await getCurrentUser(refreshed.access)
            if (isMounted) {
              setAuthState({
                user,
                accessToken: refreshed.access,
                refreshToken,
                isAuthenticated: true,
                isLoading: false,
              })
            }
          } catch {
            clearStoredTokens()
            if (isMounted) {
              setAuthState({
                user: null,
                accessToken: null,
                refreshToken: null,
                isAuthenticated: false,
                isLoading: false,
              })
            }
          }
        }
      }
    }

    restoreSession()

    return () => {
      isMounted = false
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...authState,
      login: async (credentials) => {
        const session = await loginUser(credentials)
        setSession(session)
        return session
      },
      register: async (payload) => {
        await registerUser(payload)
        const session = await loginUser({
          username: payload.username,
          password: payload.password,
        })
        setSession(session)
        return session
      },
      setSession,
      refreshSession,
      authenticatedRequest: async <T,>(path: string, options: RequestInit = {}) => {
        try {
          return await apiRequest<T>(path, {
            ...options,
            token: authState.accessToken,
          })
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            const refreshedAccessToken = await refreshSession()

            if (refreshedAccessToken) {
              return apiRequest<T>(path, {
                ...options,
                token: refreshedAccessToken,
              })
            }
          }

          throw error
        }
      },
      logout,
    }),
    [authState, logout, refreshSession, setSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
