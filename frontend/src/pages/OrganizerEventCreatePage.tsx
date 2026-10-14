import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ErrorState } from '../components/ErrorState'
import { EventForm } from '../components/EventForm'
import { LoadingState } from '../components/LoadingState'
import { useAuth } from '../context/AuthContext'
import { createEvent, getCategories } from '../services/events'
import type { Category, EventFormPayload } from '../types/events'
import { extractFieldErrors } from '../utils/forms'

type EventFormErrorKey = keyof EventFormPayload

export function OrganizerEventCreatePage() {
  const { authenticatedRequest } = useAuth()
  const navigate = useNavigate()
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<EventFormErrorKey | 'detail', string>>
  >({})

  useEffect(() => {
    let isMounted = true

    getCategories()
      .then((response) => {
        if (isMounted) {
          setCategories(response)
          setLoadError(null)
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoadError('Unable to load categories.')
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

  async function handleSubmit(payload: EventFormPayload) {
    setIsSubmitting(true)
    setFieldErrors({})
    try {
      const event = await createEvent(authenticatedRequest, payload)
      navigate(`/dashboard/events/${event.id}`, {
        state: { message: 'Event created successfully.' },
      })
    } catch (error) {
      setFieldErrors(extractFieldErrors<EventFormErrorKey>(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <LoadingState label="Preparing event form" />
  }

  if (loadError) {
    return <ErrorState description={loadError} />
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Create event
        </p>
        <h1 className="page-title">Create a new EventHub listing</h1>
        <p className="page-subtitle">
          New events are owned by your organizer account and can remain as drafts until ready.
        </p>
      </section>

      <EventForm
        categories={categories}
        showStatus={false}
        submitLabel="Create Event"
        isSubmitting={isSubmitting}
        errors={fieldErrors}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
