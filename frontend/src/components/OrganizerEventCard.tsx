import { Link } from 'react-router-dom'

import { EventImage } from './EventImage'
import type { Event } from '../types/events'
import { formatEventDate } from '../utils/formatters'

type OrganizerEventCardProps = {
  event: Event
  onDelete: (event: Event) => void
}

function getTicketSummary(event: Event) {
  return event.ticket_types.reduce(
    (summary, ticket) => ({
      capacity: summary.capacity + ticket.quantity,
      sold: summary.sold + ticket.sold,
      available: summary.available + ticket.available_tickets,
    }),
    { capacity: 0, sold: 0, available: 0 },
  )
}

export function OrganizerEventCard({ event, onDelete }: OrganizerEventCardProps) {
  const tickets = getTicketSummary(event)

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-0 md:grid-cols-[12rem_1fr]">
        <div className="aspect-[16/9] bg-slate-200 md:aspect-auto">
          <EventImage
            src={event.image}
            alt={`${event.title} event`}
            fallbackClassName="flex h-full min-h-36 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-300 px-4 text-sm font-medium text-slate-600"
          />
        </div>
        <div className="grid gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase text-slate-600">
                  {event.status}
                </span>
                <span className="text-sm text-slate-500">
                  {event.category?.name ?? 'Uncategorized'}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold text-slate-950">
                {event.title}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {formatEventDate(event.start_datetime)} at {event.venue}, {event.city}
              </p>
            </div>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Capacity</dt>
              <dd className="font-semibold text-slate-950">{tickets.capacity}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Sold</dt>
              <dd className="font-semibold text-slate-950">{tickets.sold}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Available</dt>
              <dd className="font-semibold text-slate-950">{tickets.available}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            <Link to={`/dashboard/events/${event.id}`} className="btn btn-primary">
              Manage
            </Link>
            <Link to={`/events/${event.slug}`} className="btn btn-secondary">
              View public event
            </Link>
            <button
              type="button"
              className="btn border border-red-200 bg-white text-red-700 hover:bg-red-50"
              onClick={() => onDelete(event)}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
