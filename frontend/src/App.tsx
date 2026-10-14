import { Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from './components/ProtectedRoute'
import { DashboardLayout } from './layouts/DashboardLayout'
import { MainLayout } from './layouts/MainLayout'
import { BookingsPage } from './pages/BookingsPage'
import { BookingTicketPage } from './pages/BookingTicketPage'
import { PaymentReturnPage } from './pages/PaymentReturnPage'
import { DashboardAccountPage } from './pages/DashboardAccountPage'
import { DashboardOverviewPage } from './pages/DashboardOverviewPage'
import { EventDetailPage } from './pages/EventDetailPage'
import { EventsPage } from './pages/EventsPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { OrganizerEventCreatePage } from './pages/OrganizerEventCreatePage'
import { OrganizerEventManagePage } from './pages/OrganizerEventManagePage'
import { OrganizerEventsPage } from './pages/OrganizerEventsPage'
import { OrganizerBookingsPage } from './pages/OrganizerBookingsPage'
import { RegisterPage } from './pages/RegisterPage'

function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="events/:slug" element={<EventDetailPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="bookings/:bookingReference/ticket" element={<BookingTicketPage />} />
          <Route path="payment/return" element={<PaymentReturnPage />} />
        </Route>
        <Route element={<ProtectedRoute requiredUserType="organizer" />}>
          <Route path="dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardOverviewPage />} />
            <Route path="events" element={<OrganizerEventsPage />} />
            <Route path="events/new" element={<OrganizerEventCreatePage />} />
            <Route path="events/:id" element={<OrganizerEventManagePage />} />
            <Route path="bookings" element={<OrganizerBookingsPage />} />
            <Route path="account" element={<DashboardAccountPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
