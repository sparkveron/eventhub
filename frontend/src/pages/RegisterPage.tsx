import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { getErrorMessage } from '../services/api'
import type { UserType } from '../types/auth'
import { getPostAuthPath } from '../utils/authRedirects'

export function RegisterPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading, register, user } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [userType, setUserType] = useState<UserType>('attendee')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isLoading && isAuthenticated) {
    return <Navigate to={getPostAuthPath(user)} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const session = await register({
        username,
        email,
        password,
        password_confirm: passwordConfirm,
        user_type: userType,
      })
      navigate(getPostAuthPath(session.user), { replace: true })
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
          Join EventHub
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal text-slate-950">
          Create an account for event booking or organizing.
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          Register as an attendee to book tickets, or as an organizer to prepare
          for event management tools.
        </p>
      </section>

      <section className="card">
        <h2 className="text-2xl font-semibold text-slate-950">Register</h2>
        <form className="form-grid mt-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="register-username">
                Username
              </label>
              <input
                id="register-username"
                className="form-input mt-2"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="form-label" htmlFor="register-email">
                Email
              </label>
              <input
                id="register-email"
                className="form-input mt-2"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div>
            <label className="form-label" htmlFor="user-type">
              Account type
            </label>
            <select
              id="user-type"
              className="form-input mt-2"
              value={userType}
              onChange={(event) => setUserType(event.target.value as UserType)}
            >
              <option value="attendee">Attendee</option>
              <option value="organizer">Organizer</option>
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="register-password">
                Password
              </label>
              <input
                id="register-password"
                className="form-input mt-2"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div>
              <label className="form-label" htmlFor="register-password-confirm">
                Confirm password
              </label>
              <input
                id="register-password-confirm"
                className="form-input mt-2"
                type="password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-slate-950 hover:underline">
            Sign in
          </Link>
        </p>
      </section>
    </div>
  )
}
