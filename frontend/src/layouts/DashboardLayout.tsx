import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

const dashboardNavItems = [
  { to: '/dashboard', label: 'Overview', end: true },
  { to: '/dashboard/events', label: 'My Events' },
  { to: '/dashboard/events/new', label: 'Create Event' },
  { to: '/dashboard/bookings', label: 'Bookings' },
  { to: '/dashboard/account', label: 'Account' },
  { to: '/', label: 'Back to EventHub' },
]

function getNavLinkClass(isActive: boolean) {
  return `rounded-md px-3 py-2 font-medium transition-colors ${
    isActive
      ? 'bg-slate-950 text-white'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
  }`
}

function isDashboardNavItemActive(to: string, pathname: string) {
  if (to === '/dashboard') {
    return pathname === '/dashboard'
  }

  if (to === '/dashboard/events/new') {
    return pathname === '/dashboard/events/new'
  }

  if (to === '/dashboard/events') {
    return (
      pathname === '/dashboard/events'
      || (
        pathname.startsWith('/dashboard/events/')
        && pathname !== '/dashboard/events/new'
      )
    )
  }

  if (to === '/dashboard/account') {
    return pathname === '/dashboard/account'
  }

  if (to === '/dashboard/bookings') {
    return pathname === '/dashboard/bookings'
  }

  return false
}

export function DashboardLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-center justify-between gap-4 lg:hidden">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Organizer
          </p>
          <h1 className="text-2xl font-semibold text-slate-950">Dashboard</h1>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          aria-expanded={isMenuOpen}
          aria-controls="dashboard-navigation"
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          Menu
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
        <aside
          id="dashboard-navigation"
          className={`${isMenuOpen ? 'block' : 'hidden'} lg:block`}
        >
          <div className="sticky top-24 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="hidden border-b border-slate-100 pb-4 lg:block">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                EventHub
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">
                Organizer
              </h2>
            </div>
            <nav className="mt-4 grid gap-1 text-sm">
              {dashboardNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setIsMenuOpen(false)}
                  className={getNavLinkClass(
                    isDashboardNavItemActive(item.to, location.pathname),
                  )}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </aside>

        <section className="min-w-0">
          <Outlet />
        </section>
      </div>
    </div>
  )
}
