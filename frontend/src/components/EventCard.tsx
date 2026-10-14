import { Link } from 'react-router-dom'

import { EventImage } from './EventImage'
import type { Event } from '../types/events'
import { formatCurrency, formatEventDate, formatEventTime } from '../utils/formatters'

type EventCardProps = {
  event: Event
}

function getStartingPrice(event: Event) {
  if (event.ticket_types.length === 0) {
    return null
  }

  return event.ticket_types.reduce((lowest, ticket) => {
    const price = Number(ticket.price)
    return price < lowest ? price : lowest
  }, Number(event.ticket_types[0].price))
}

export function EventCard({ event }: EventCardProps) {
  const startingPrice = getStartingPrice(event)

  return (
    <Link
      to={`/events/${event.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
    >
      <div className="aspect-[16/10] bg-slate-200">
        <EventImage src={event.image} alt={`${event.title} event`} />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          <span>{event.category?.name ?? 'Event'}</span>
          <span aria-hidden="true">/</span>
          <span>{event.city}</span>
        </div>
        <h2
          className="mt-3 min-h-14 overflow-hidden text-xl font-semibold text-slate-950 group-hover:text-slate-700 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
          title={event.title}
        >
          {event.title}
        </h2>
        <p className="mt-2 flex-1 overflow-hidden text-sm leading-6 text-slate-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
          {event.description}
        </p>
        <dl className="mt-5 grid gap-2 text-sm text-slate-700">
          <div className="flex justify-between gap-4">
            <dt className="font-medium text-slate-500">Date</dt>
            <dd className="text-right">{formatEventDate(event.start_datetime)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="font-medium text-slate-500">Time</dt>
            <dd className="text-right">{formatEventTime(event.start_datetime)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="font-medium text-slate-500">Venue</dt>
            <dd className="min-w-0 truncate text-right" title={event.venue}>
              {event.venue}
            </dd>
          </div>
        </dl>
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-sm text-slate-500">From</span>
          <span className="font-semibold text-slate-950">
            {startingPrice === null ? 'TBA' : formatCurrency(startingPrice)}
          </span>
        </div>
      </div>
    </Link>
  )
}
