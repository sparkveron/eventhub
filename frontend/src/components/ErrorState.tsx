type ErrorStateProps = {
  title?: string
  description?: string
  onRetry?: () => void
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this content. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <section className="card border-red-200 bg-red-50 text-center">
      <h2 className="text-xl font-semibold text-red-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-red-700">
        {description}
      </p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary mt-5" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </section>
  )
}
