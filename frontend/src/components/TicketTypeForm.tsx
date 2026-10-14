import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import type { TicketType, TicketTypeFormPayload } from '../types/events'

type TicketErrors = Partial<Record<keyof TicketTypeFormPayload | 'detail', string>>

type TicketTypeFormProps = {
  initialTicket?: TicketType
  isSubmitting?: boolean
  errors?: TicketErrors
  submitLabel: string
  onCancel?: () => void
  onSubmit: (payload: TicketTypeFormPayload) => void
}

export function TicketTypeForm({
  initialTicket,
  isSubmitting = false,
  errors = {},
  submitLabel,
  onCancel,
  onSubmit,
}: TicketTypeFormProps) {
  const initialValues = useMemo(
    () => ({
      name: initialTicket?.name ?? '',
      description: initialTicket?.description ?? '',
      price: initialTicket?.price ?? '',
      quantity: initialTicket ? String(initialTicket.quantity) : '',
    }),
    [initialTicket],
  )
  const [values, setValues] = useState(initialValues)
  const [clientError, setClientError] = useState<string | null>(null)

  function updateValue(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setClientError(null)

    const quantity = Number(values.quantity)
    const price = Number(values.price)

    if (!values.name.trim()) {
      setClientError('Ticket name is required.')
      return
    }

    if (Number.isNaN(price) || price < 0) {
      setClientError('Ticket price must be zero or greater.')
      return
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      setClientError('Ticket quantity must be a whole number zero or greater.')
      return
    }

    onSubmit({
      name: values.name.trim(),
      description: values.description.trim(),
      price: price.toFixed(2),
      quantity,
    })
  }

  return (
    <form className="rounded-lg border border-slate-200 bg-slate-50 p-4" onSubmit={handleSubmit}>
      {(clientError || errors.detail) ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {clientError ?? errors.detail}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="form-label" htmlFor="ticket-name">
            Ticket name
          </label>
          <input
            id="ticket-name"
            className="form-input mt-2"
            value={values.name}
            onChange={(event) => updateValue('name', event.target.value)}
            required
          />
          {errors.name ? <p className="mt-1 text-sm text-red-600">{errors.name}</p> : null}
        </div>
        <div>
          <label className="form-label" htmlFor="ticket-price">
            Price
          </label>
          <input
            id="ticket-price"
            className="form-input mt-2"
            type="number"
            min="0"
            step="0.01"
            value={values.price}
            onChange={(event) => updateValue('price', event.target.value)}
            required
          />
          {errors.price ? <p className="mt-1 text-sm text-red-600">{errors.price}</p> : null}
        </div>
        <div>
          <label className="form-label" htmlFor="ticket-quantity">
            Quantity
          </label>
          <input
            id="ticket-quantity"
            className="form-input mt-2"
            type="number"
            min="0"
            step="1"
            value={values.quantity}
            onChange={(event) => updateValue('quantity', event.target.value)}
            required
          />
          {errors.quantity ? (
            <p className="mt-1 text-sm text-red-600">{errors.quantity}</p>
          ) : null}
        </div>
        <div className="md:col-span-2">
          <label className="form-label" htmlFor="ticket-description">
            Description
          </label>
          <textarea
            id="ticket-description"
            className="form-input mt-2 min-h-24"
            value={values.description}
            onChange={(event) => updateValue('description', event.target.value)}
          />
          {errors.description ? (
            <p className="mt-1 text-sm text-red-600">{errors.description}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
