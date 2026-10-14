import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { EventCard } from '../components/EventCard'
import { LoadingState } from '../components/LoadingState'
import { useAuth } from '../context/AuthContext'
import { getEvents } from '../services/events'
import type { Event } from '../types/events'

const valueProps = [
  {
    title: 'Discover events',
    description: 'Find concerts, workshops, community gatherings, and professional events in one polished experience.',
  },
  {
    title: 'Book with confidence',
    description: 'Ticket availability and booking totals are handled by the backend so attendees get reliable confirmations.',
  },
  {
    title: 'Manage with ease',
    description: 'Organizer tools are ready to grow from the same event and ticket foundation.',
  },
]

export function HomePage() {
  const { user } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isOrganizer = user?.user_type === 'organizer'

  useEffect(() => {
    let isMounted = true

    getEvents({ ordering: 'start_datetime', page_size: 3 })
      .then((response) => {
        if (isMounted) {
          setEvents(response.results)
          setError(null)
        }
      })
      .catch(() => {
        if (isMounted) {
          setError('Unable to load featured events from the API.')
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="space-y-14">
      <section className="grid items-center gap-8 rounded-2xl bg-slate-950 px-6 py-12 text-white shadow-sm sm:px-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-12 lg:py-16">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-300">
            Event booking, made clear
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-normal sm:text-5xl">
            Discover memorable events and book your spot with confidence.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            EventHub brings event discovery, ticket availability, and booking
            flows into one modern platform for attendees and organizers.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/events" className="btn bg-white text-slate-950 hover:bg-slate-100">
              Explore Events
            </Link>
            {!isOrganizer ? (
              <Link to="/register" className="btn border border-white/30 text-white hover:bg-white/10">
                Become an Organizer
              </Link>
            ) : null}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <dl className="grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
            <div>
              <dt className="text-sm text-slate-400">Live API</dt>
              <dd className="mt-1 text-2xl font-semibold">Django</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-400">Booking logic</dt>
              <dd className="mt-1 text-2xl font-semibold">Protected</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-400">Experience</dt>
              <dd className="mt-1 text-2xl font-semibold">Responsive</dd>
            </div>
          </dl>
        </div>
      </section>

      <section>
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Upcoming
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">
              Featured events
            </h2>
          </div>
          <Link to="/events" className="btn btn-secondary">
            View all events
          </Link>
        </div>
        {isLoading ? <LoadingState label="Loading featured events" /> : null}
        {!isLoading && error ? <ErrorState description={error} /> : null}
        {!isLoading && !error && events.length === 0 ? (
          <EmptyState
            title="No published events yet"
            description="Once organizers publish events, they will appear here automatically."
          />
        ) : null}
        {!isLoading && !error && events.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        {valueProps.map((item) => (
          <article key={item.title} className="card">
            <h3 className="text-xl font-semibold text-slate-950">{item.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
          </article>
        ))}
      </section>

      <section className="card flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">
            Ready to find your next event?
          </h2>
          <p className="mt-2 text-slate-600">
            Browse published events and inspect live ticket availability.
          </p>
        </div>
        <Link to="/events" className="btn btn-primary">
          Explore Events
        </Link>
      </section>
    </div>
  )
}
