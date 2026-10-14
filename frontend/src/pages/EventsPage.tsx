import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Breadcrumbs } from '../components/Breadcrumbs'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { EventCard } from '../components/EventCard'
import { LoadingState } from '../components/LoadingState'
import { getCategories, getEvents } from '../services/events'
import type { Category, Event } from '../types/events'

const orderingOptions = [
  { value: 'start_datetime', label: 'Upcoming first' },
  { value: '-created_at', label: 'Newest first' },
  { value: 'title', label: 'Title A-Z' },
]
const defaultOrdering = 'start_datetime'

function getCleanPage(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

export function EventsPage() {
  const [urlSearchParams, setUrlSearchParams] = useSearchParams()
  const [events, setEvents] = useState<Event[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [cityInput, setCityInput] = useState('')
  const [count, setCount] = useState(0)
  const [next, setNext] = useState<string | null>(null)
  const [previous, setPrevious] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pageSize = 9
  const search = urlSearchParams.get('search')?.trim() ?? ''
  const category = urlSearchParams.get('category') ?? ''
  const city = urlSearchParams.get('city')?.trim() ?? ''
  const requestedOrdering = urlSearchParams.get('ordering') ?? defaultOrdering
  const ordering = orderingOptions.some((option) => option.value === requestedOrdering)
    ? requestedOrdering
    : defaultOrdering
  const page = getCleanPage(urlSearchParams.get('page'))
  const selectedCategory = categories.find((item) => item.slug === category)
  const selectedOrdering = orderingOptions.find((option) => option.value === ordering)
  const hasActiveFilters = Boolean(
    search || category || city || ordering !== defaultOrdering,
  )

  useEffect(() => {
    let isMounted = true

    getCategories()
      .then((response) => {
        if (isMounted) {
          setCategories(response)
        }
      })
      .catch(() => {
        if (isMounted) {
          setCategories([])
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    setSearchInput(search)
    setCityInput(city)
  }, [city, search])

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)

    getEvents({
      search,
      category,
      city,
      ordering,
      page,
      page_size: pageSize,
    })
      .then((response) => {
        if (isMounted) {
          setEvents(response.results)
          setCount(response.count)
          setNext(response.next)
          setPrevious(response.previous)
          setError(null)
        }
      })
      .catch(() => {
        if (isMounted) {
          setError('Unable to load events from the API.')
          setEvents([])
          setCount(0)
          setNext(null)
          setPrevious(null)
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
  }, [category, city, ordering, page, search])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(count / pageSize)),
    [count],
  )

  function updateDiscoveryParams(
    updates: Record<string, string | number | null | undefined>,
  ) {
    const nextParams = new URLSearchParams(urlSearchParams)

    Object.entries(updates).forEach(([key, value]) => {
      const normalizedValue = String(value ?? '').trim()

      if (
        !normalizedValue ||
        (key === 'ordering' && normalizedValue === defaultOrdering) ||
        (key === 'page' && normalizedValue === '1')
      ) {
        nextParams.delete(key)
      } else {
        nextParams.set(key, normalizedValue)
      }
    })

    if (nextParams.toString() !== urlSearchParams.toString()) {
      setUrlSearchParams(nextParams)
    }
  }

  function applyDiscovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateDiscoveryParams({
      search: searchInput,
      city: cityInput,
      page: null,
    })
  }

  function updateFilter(key: 'category' | 'ordering', value: string) {
    updateDiscoveryParams({
      [key]: value,
      page: null,
    })
  }

  function clearFilters() {
    setSearchInput('')
    setCityInput('')
    setUrlSearchParams(new URLSearchParams())
  }

  function removeFilter(key: 'search' | 'category' | 'city' | 'ordering') {
    if (key === 'search') {
      setSearchInput('')
    }

    if (key === 'city') {
      setCityInput('')
    }

    updateDiscoveryParams({
      [key]: null,
      page: null,
    })
  }

  function goToPage(nextPage: number) {
    updateDiscoveryParams({ page: Math.max(1, nextPage) })
  }

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Events' },
        ]}
      />

      <section className="page-header">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Browse events
        </p>
        <h1 className="page-title">Find your next experience</h1>
        <p className="page-subtitle">
          Search published events from the EventHub API by title, description,
          venue, city, category, and ordering.
        </p>
      </section>

      <section className="card">
        <form className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(13rem,0.55fr)_auto]" onSubmit={applyDiscovery}>
          <div>
            <label className="form-label" htmlFor="event-search">
              Search events
            </label>
            <input
              id="event-search"
              className="form-input mt-2"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by title, description, venue, or city"
            />
          </div>
          <div>
            <label className="form-label" htmlFor="city-filter">
              City
            </label>
            <input
              id="city-filter"
              className="form-input mt-2"
              value={cityInput}
              onChange={(event) => setCityInput(event.target.value)}
              placeholder="Exact city, e.g. Accra"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <button type="submit" className="btn btn-primary">
              Apply
            </button>
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>
              Reset
            </button>
          </div>
        </form>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="form-label" htmlFor="category-filter">
              Category
            </label>
            <select
              id="category-filter"
              className="form-input mt-2"
              value={category}
              onChange={(event) => updateFilter('category', event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item.id} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="ordering-filter">
              Sort
            </label>
            <select
              id="ordering-filter"
              className="form-input mt-2"
              value={ordering}
              onChange={(event) => updateFilter('ordering', event.target.value)}
            >
              {orderingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {hasActiveFilters ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5">
            <span className="text-sm font-medium text-slate-500">Active filters:</span>
            {search ? (
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                aria-label={`Remove search filter ${search}`}
                onClick={() => removeFilter('search')}
              >
                Search: {search} <span aria-hidden="true">x</span>
              </button>
            ) : null}
            {category ? (
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                aria-label={`Remove category filter ${selectedCategory?.name ?? category}`}
                onClick={() => removeFilter('category')}
              >
                Category: {selectedCategory?.name ?? category} <span aria-hidden="true">x</span>
              </button>
            ) : null}
            {city ? (
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                aria-label={`Remove city filter ${city}`}
                onClick={() => removeFilter('city')}
              >
                City: {city} <span aria-hidden="true">x</span>
              </button>
            ) : null}
            {ordering !== defaultOrdering ? (
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                aria-label={`Remove sort option ${selectedOrdering?.label ?? ordering}`}
                onClick={() => removeFilter('ordering')}
              >
                Sort: {selectedOrdering?.label ?? ordering} <span aria-hidden="true">x</span>
              </button>
            ) : null}
            <button
              type="button"
              className="text-sm font-semibold text-slate-600 hover:text-slate-950"
              onClick={clearFilters}
            >
              Clear all
            </button>
          </div>
        ) : null}
      </section>

      {isLoading ? <LoadingState label="Loading events" /> : null}
      {!isLoading && error ? <ErrorState description={error} /> : null}
      {!isLoading && !error && events.length === 0 ? (
        <EmptyState
          title="No events found"
          description="Try adjusting your search or filters. Published events will appear here when they match your criteria."
        />
      ) : null}
      {!isLoading && !error && events.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
            <p>
              Showing {events.length} of {count} events
            </p>
            <p>
              Page {page} of {totalPages}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!previous}
              onClick={() => goToPage(page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!next}
              onClick={() => goToPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
