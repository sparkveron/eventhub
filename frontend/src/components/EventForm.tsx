import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import type { Category, Event, EventFormPayload, EventStatus } from '../types/events'

type FieldErrors = Partial<Record<keyof EventFormPayload | 'detail', string>>

type EventFormProps = {
  categories: Category[]
  initialEvent?: Event
  showStatus?: boolean
  isSubmitting?: boolean
  errors?: FieldErrors
  submitLabel: string
  onSubmit: (payload: EventFormPayload) => void
}

const eventStatuses: EventStatus[] = ['draft', 'published', 'cancelled', 'completed']

function toDateTimeLocal(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toApiDateTime(value: string) {
  return new Date(value).toISOString()
}

export function EventForm({
  categories,
  initialEvent,
  showStatus = true,
  isSubmitting = false,
  errors = {},
  submitLabel,
  onSubmit,
}: EventFormProps) {
  const initialValues = useMemo(
    () => ({
      title: initialEvent?.title ?? '',
      description: initialEvent?.description ?? '',
      venue: initialEvent?.venue ?? '',
      address: initialEvent?.address ?? '',
      city: initialEvent?.city ?? '',
      start_datetime: initialEvent ? toDateTimeLocal(initialEvent.start_datetime) : '',
      end_datetime: initialEvent ? toDateTimeLocal(initialEvent.end_datetime) : '',
      category: initialEvent?.category?.id ? String(initialEvent.category.id) : '',
      status: initialEvent?.status ?? 'draft',
      image: null as File | null,
    }),
    [initialEvent],
  )
  const [values, setValues] = useState(initialValues)
  const [clientError, setClientError] = useState<string | null>(null)

  function updateValue(name: keyof typeof values, value: string | File | null) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setClientError(null)

    if (!values.title.trim() || !values.description.trim() || !values.venue.trim()) {
      setClientError('Title, description, and venue are required.')
      return
    }

    if (!values.address.trim() || !values.city.trim()) {
      setClientError('Address and city are required.')
      return
    }

    if (!values.start_datetime || !values.end_datetime) {
      setClientError('Start and end date/time are required.')
      return
    }

    if (new Date(values.end_datetime) <= new Date(values.start_datetime)) {
      setClientError('End date/time must be after start date/time.')
      return
    }

    const payload: EventFormPayload = {
      title: values.title.trim(),
      description: values.description.trim(),
      venue: values.venue.trim(),
      address: values.address.trim(),
      city: values.city.trim(),
      start_datetime: toApiDateTime(values.start_datetime),
      end_datetime: toApiDateTime(values.end_datetime),
      category: values.category ? Number(values.category) : null,
      image: values.image,
    }

    if (showStatus) {
      payload.status = values.status as EventStatus
    }

    onSubmit(payload)
  }

  return (
    <form className="card grid gap-5" onSubmit={handleSubmit}>
      {(clientError || errors.detail) ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {clientError ?? errors.detail}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="form-label" htmlFor="event-title">
            Title
          </label>
          <input
            id="event-title"
            className="form-input mt-2"
            value={values.title}
            onChange={(event) => updateValue('title', event.target.value)}
            required
          />
          {errors.title ? <p className="mt-1 text-sm text-red-600">{errors.title}</p> : null}
        </div>

        <div className="md:col-span-2">
          <label className="form-label" htmlFor="event-description">
            Description
          </label>
          <textarea
            id="event-description"
            className="form-input mt-2 min-h-32"
            value={values.description}
            onChange={(event) => updateValue('description', event.target.value)}
            required
          />
          {errors.description ? (
            <p className="mt-1 text-sm text-red-600">{errors.description}</p>
          ) : null}
        </div>

        <div>
          <label className="form-label" htmlFor="event-category">
            Category
          </label>
          <select
            id="event-category"
            className="form-input mt-2"
            value={values.category}
            onChange={(event) => updateValue('category', event.target.value)}
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.category ? <p className="mt-1 text-sm text-red-600">{errors.category}</p> : null}
        </div>

        {showStatus ? (
          <div>
            <label className="form-label" htmlFor="event-status">
              Status
            </label>
            <select
              id="event-status"
              className="form-input mt-2"
              value={values.status}
              onChange={(event) => updateValue('status', event.target.value)}
            >
              {eventStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            {errors.status ? <p className="mt-1 text-sm text-red-600">{errors.status}</p> : null}
          </div>
        ) : null}

        <div>
          <label className="form-label" htmlFor="event-start">
            Start date/time
          </label>
          <input
            id="event-start"
            className="form-input mt-2"
            type="datetime-local"
            value={values.start_datetime}
            onChange={(event) => updateValue('start_datetime', event.target.value)}
            required
          />
          {errors.start_datetime ? (
            <p className="mt-1 text-sm text-red-600">{errors.start_datetime}</p>
          ) : null}
        </div>

        <div>
          <label className="form-label" htmlFor="event-end">
            End date/time
          </label>
          <input
            id="event-end"
            className="form-input mt-2"
            type="datetime-local"
            value={values.end_datetime}
            onChange={(event) => updateValue('end_datetime', event.target.value)}
            required
          />
          {errors.end_datetime ? (
            <p className="mt-1 text-sm text-red-600">{errors.end_datetime}</p>
          ) : null}
        </div>

        <div>
          <label className="form-label" htmlFor="event-venue">
            Venue
          </label>
          <input
            id="event-venue"
            className="form-input mt-2"
            value={values.venue}
            onChange={(event) => updateValue('venue', event.target.value)}
            required
          />
          {errors.venue ? <p className="mt-1 text-sm text-red-600">{errors.venue}</p> : null}
        </div>

        <div>
          <label className="form-label" htmlFor="event-city">
            City
          </label>
          <input
            id="event-city"
            className="form-input mt-2"
            value={values.city}
            onChange={(event) => updateValue('city', event.target.value)}
            required
          />
          {errors.city ? <p className="mt-1 text-sm text-red-600">{errors.city}</p> : null}
        </div>

        <div className="md:col-span-2">
          <label className="form-label" htmlFor="event-image">
            Event image
          </label>
          <input
            id="event-image"
            className="form-input mt-2"
            type="file"
            accept="image/*"
            onChange={(event) => updateValue('image', event.target.files?.[0] ?? null)}
          />
          {initialEvent?.image ? (
            <p className="mt-1 text-sm text-slate-500">
              Choose a file only if you want to replace the current image.
            </p>
          ) : null}
          {errors.image ? <p className="mt-1 text-sm text-red-600">{errors.image}</p> : null}
        </div>

        <div className="md:col-span-2">
          <label className="form-label" htmlFor="event-address">
            Address
          </label>
          <input
            id="event-address"
            className="form-input mt-2"
            value={values.address}
            onChange={(event) => updateValue('address', event.target.value)}
            required
          />
          {errors.address ? <p className="mt-1 text-sm text-red-600">{errors.address}</p> : null}
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
