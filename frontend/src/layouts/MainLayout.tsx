import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { formatDisplayName } from '../utils/displayName'

const publicNavItems = [
  { to: '/events', label: 'Events' },
]

const attendeeNavItems = [
  { to: '/events', label: 'Events' },
  { to: '/bookings', label: 'Bookings' },
]

const organizerNavItems = [
  { to: '/events', label: 'Events' },
  { to: '/dashboard', label: 'Dashboard' },
]

function getNavLinkClass(isActive: boolean) {
  return `rounded-md px-3 py-2 font-medium transition-colors ${
    isActive
      ? 'bg-slate-950 text-white'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
  }`
}

export function MainLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { isAuthenticated, user, logout } = useAuth()
  const location = useLocation()

  const closeMenu = () => setIsMenuOpen(false)
  const isOrganizer = user?.user_type === 'organizer'
  const isDashboardRoute = location.pathname.startsWith('/dashboard')
  const useDashboardHeader = isOrganizer && isDashboardRoute
  const displayName = formatDisplayName(user?.username)
  const navItems = isOrganizer
    ? organizerNavItems
    : isAuthenticated
      ? attendeeNavItems
      : publicNavItems

  return (
    <div className="app-shell">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 items-center justify-between gap-4">
            <NavLink to="/" className="text-xl font-semibold text-slate-950" onClick={closeMenu}>
              EventHub
            </NavLink>
            {useDashboardHeader ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-600">
                  {displayName}
                </span>
                <button type="button" className="btn btn-secondary" onClick={logout}>
                  Logout
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-secondary lg:hidden"
                  aria-controls="primary-navigation"
                  aria-expanded={isMenuOpen}
                  onClick={() => setIsMenuOpen((current) => !current)}
                >
                  Menu
                </button>
                <nav id="primary-navigation" className="hidden items-center gap-2 text-sm lg:flex">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => getNavLinkClass(isActive)}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                  {isAuthenticated ? (
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-600">
                        {displayName}
                      </span>
                      <button type="button" className="btn btn-secondary" onClick={logout}>
                        Logout
                      </button>
                    </div>
                  ) : (
                    <>
                      <NavLink to="/login" className="btn btn-secondary">
                        Login
                      </NavLink>
                      <NavLink to="/register" className="btn btn-primary">
                        Register
                      </NavLink>
                    </>
                  )}
                </nav>
              </>
            )}
          </div>
          {!useDashboardHeader && isMenuOpen ? (
            <nav className="grid gap-2 border-t border-slate-200 py-4 text-sm lg:hidden">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={closeMenu}
                  className={({ isActive }) => getNavLinkClass(isActive)}
                >
                  {item.label}
                </NavLink>
              ))}
              {isAuthenticated ? (
                <button
                  type="button"
                  className="btn btn-secondary justify-start"
                  onClick={() => {
                    logout()
                    closeMenu()
                  }}
                >
                  Logout {displayName ? `(${displayName})` : ''}
                </button>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <NavLink to="/login" className="btn btn-secondary" onClick={closeMenu}>
                    Login
                  </NavLink>
                  <NavLink to="/register" className="btn btn-primary" onClick={closeMenu}>
                    Register
                  </NavLink>
                </div>
              )}
            </nav>
          ) : null}
        </div>
      </header>
      <main className="page-container">
        <Outlet />
      </main>
    </div>
  )
}
