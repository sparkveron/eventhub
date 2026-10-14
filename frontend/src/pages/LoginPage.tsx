import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { getErrorMessage } from '../services/api'
import { getPostAuthPath } from '../utils/authRedirects'

type LocationState = {
  from?: {
    pathname?: string
  }
}

function getLoginRedirectPath(requestedPath: string | undefined, userType: string) {
  if (!requestedPath || requestedPath === '/login' || requestedPath === '/register') {
    return userType === 'organizer' ? '/dashboard' : '/events'
  }

  if (requestedPath.startsWith('/dashboard') && userType !== 'organizer') {
    return '/events'
  }

  return requestedPath
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading, login, user } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const state = location.state as LocationState | null
  const requestedPath = state?.from?.pathname

  if (!isLoading && isAuthenticated) {
    return <Navigate to={getPostAuthPath(user)} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const session = await login({ username, password })
      const redirectTo = requestedPath
        ? getLoginRedirectPath(requestedPath, session.user.user_type)
        : getPostAuthPath(session.user)
      navigate(redirectTo, { replace: true })
    } catch (caughtError) {
      setError(getErrorMessage(caughtError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <section>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Welcome back
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal text-slate-950">
          Sign in to manage your EventHub experience.
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          Access bookings, organizer tools, and personalized event actions with
          your EventHub account.
        </p>
      </section>

      <section className="card">
        <h2 className="text-2xl font-semibold text-slate-950">Login</h2>
        <form className="form-grid mt-6" onSubmit={handleSubmit}>
          <div>
            <label className="form-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="form-input mt-2"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="form-input mt-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-600">
          New to EventHub?{' '}
          <Link to="/register" className="font-medium text-slate-950 hover:underline">
            Create an account
          </Link>
        </p>
      </section>
    </div>
  )
}
