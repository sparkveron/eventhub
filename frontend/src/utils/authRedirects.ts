import type { User } from '../types/auth'

export function getPostAuthPath(user: User | null) {
  return user?.user_type === 'organizer' ? '/dashboard' : '/events'
}
