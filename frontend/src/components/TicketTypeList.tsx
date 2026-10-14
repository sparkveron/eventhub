import type { ReactNode } from 'react'

import type { TicketType } from '../types/events'
import { formatCurrency } from '../utils/formatters'

type TicketTypeListProps = {
  tickets: TicketType[]
  editingTicketId: number | null
  onEdit: (ticket: TicketType) => void
  onDelete: (ticket: TicketType) => void
  renderEditForm: (ticket: TicketType) => ReactNode
}

export function TicketTypeList({
  tickets,
  editingTicketId,
  onEdit,
  onDelete,
  renderEditForm,
}: TicketTypeListProps) {
  if (tickets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <h3 className="font-semibold text-slate-950">No ticket types yet</h3>
        <p className="mt-2 text-sm text-slate-600">
          Add ticket types when this event is ready for attendees.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {tickets.map((ticket) => (
        <article key={ticket.id} className="rounded-lg border border-slate-200 bg-white p-4">
          {editingTicketId === ticket.id ? (
            renderEditForm(ticket)
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{ticket.name}</h3>
                {ticket.description ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {ticket.description}
                  </p>
                ) : null}
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-slate-500">Price</dt>
                    <dd className="font-semibold text-slate-950">
                      {formatCurrency(ticket.price)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Quantity</dt>
                    <dd className="font-semibold text-slate-950">{ticket.quantity}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Sold</dt>
                    <dd className="font-semibold text-slate-950">{ticket.sold}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Available</dt>
                    <dd className="font-semibold text-slate-950">
                      {ticket.available_tickets}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onEdit(ticket)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn border border-red-200 bg-white text-red-700 hover:bg-red-50"
                  onClick={() => onDelete(ticket)}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
