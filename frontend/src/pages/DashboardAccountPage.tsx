import { useAuth } from '../context/AuthContext'
import { formatDisplayName } from '../utils/displayName'

export function DashboardAccountPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Account
        </p>
        <h1 className="page-title">Organizer account</h1>
        <p className="page-subtitle">
          Your authenticated EventHub profile for organizer dashboard access.
        </p>
      </section>

      <section className="card">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-500">Username</dt>
            <dd className="mt-1 font-semibold text-slate-950">
              {formatDisplayName(user?.username)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Email</dt>
            <dd className="mt-1 text-slate-700">{user?.email}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Account type</dt>
            <dd className="mt-1 font-semibold text-slate-950">{user?.user_type}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Phone</dt>
            <dd className="mt-1 text-slate-700">{user?.phone_number || 'Not provided'}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
