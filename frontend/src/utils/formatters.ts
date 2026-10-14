export function formatEventDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

export function formatEventTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

const displayCurrency = (import.meta.env.VITE_CURRENCY ?? 'USD').trim().toUpperCase() || 'USD'

export function formatCurrency(value: string | number, currency = displayCurrency) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(Number(value))
}
