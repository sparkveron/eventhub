export type UserType = 'attendee' | 'organizer'

export interface Profile {
  user_type: UserType
  phone_number: string
  profile_picture: string | null
}

export interface User {
  id: number
  username: string
  email: string
  user_type: UserType
  phone_number: string
  profile_picture: string | null
}

export interface LoginResponse {
  access: string
  refresh: string
  user: User
}

export interface LoginCredentials {
  username: string
  password: string
}

export interface RegisterPayload {
  username: string
  email: string
  password: string
  password_confirm: string
  user_type: UserType
}

export interface TokenRefreshResponse {
  access: string
}

export interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
}
