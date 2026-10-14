export function formatDisplayName(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? ''

  if (!normalized) {
    return ''
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}
